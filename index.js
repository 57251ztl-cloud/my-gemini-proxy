const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// 你的Gemini密钥通过环境变量设置
const GEMINI_KEY = process.env.GEMINI_KEY;

// 健康检查 - 用于测试服务是否正常
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Gemini OpenAI Proxy is running',
    timestamp: new Date().toISOString()
  });
});

// OpenAI兼容的模型列表端点
app.get('/v1/models', (req, res) => {
  try {
    console.log('收到模型列表请求');
    
    // 返回固定的模型列表
    const models = {
      object: "list",
      data: [
        {
          id: "gemini-pro",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "google"
        },
        {
          id: "gemini-1.5-pro",
          object: "model", 
          created: Math.floor(Date.now() / 1000),
          owned_by: "google"
        }
      ]
    };
    
    console.log('返回模型列表');
    res.json(models);
    
  } catch (error) {
    console.error('模型列表错误:', error);
    res.status(500).json({ 
      error: { 
        message: error.message,
        type: "internal_error" 
      } 
    });
  }
});

// OpenAI兼容的聊天完成端点
app.post('/v1/chat/completions', async (req, res) => {
  try {
    console.log('收到聊天请求');
    
    const { messages, model = "gemini-pro" } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Missing messages array');
    }
    
    // 获取最后一条用户消息
    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }
    
    // 构建Gemini请求格式
    const geminiRequest = {
      contents: [
        {
          parts: [
            {
              text: lastUserMessage.content
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    };
    
    console.log('发送到Gemini API');
    
    // 调用Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest)
      }
    );
    
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }
    
    const geminiData = await geminiResponse.json();
    console.log('Gemini返回数据');
    
    if (!geminiData.candidates || !geminiData.candidates[0]) {
      throw new Error('No response from Gemini');
    }
    
    const geminiText = geminiData.candidates[0].content.parts[0].text;
    
    // 构建OpenAI兼容的响应
    const openAIResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: geminiText
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
    
    console.log('返回OpenAI格式响应');
    res.json(openAIResponse);
    
  } catch (error) {
    console.error('聊天处理错误:', error);
    res.status(500).json({ 
      error: { 
        message: error.message,
        type: "api_error",
        code: "processing_error"
      } 
    });
  }
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: { 
      message: `Route ${req.originalUrl} not found`,
      type: "not_found" 
    } 
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('未处理的错误:', error);
  res.status(500).json({ 
    error: { 
      message: 'Internal server error',
      type: "internal_error" 
    } 
  });
});

// 使用Render分配的端口
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Gemini OpenAI Proxy服务运行在端口 ${PORT}`);
  console.log(`🔑 Gemini密钥: ${GEMINI_KEY ? '已设置' : '未设置'}`);
});
