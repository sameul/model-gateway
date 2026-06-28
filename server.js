const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');

function getDefaultConfig() {
  return {
    models: {
      'zhipu-glm-4': {
        name: '智谱 GLM-4',
        provider: 'zhipu',
        apiKey: '',
        apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        maxTokens: 4096
      },
      'deepseek-chat': {
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        apiKey: '',
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        maxTokens: 4096
      },
      'qwen-max': {
        name: '阿里 Qwen-Max',
        provider: 'alibaba',
        apiKey: '',
        apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        maxTokens: 4096
      }
    },
    selectedModel: 'zhipu-glm-4',
    port: 3000
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return getDefaultConfig();
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let config = loadConfig();
const app = express();
app.use(cors());
app.use(express.json());

// ============ API 路由 ============

// 获取所有模型
app.get('/api/models', (req, res) => {
  res.json({ models: config.models, selected: config.selectedModel });
});

// 更新模型配置
app.post('/api/models/:key', (req, res) => {
  const { key } = req.params;
  if (!config.models[key]) {
    return res.status(404).json({ error: '模型不存在' });
  }
  config.models[key] = { ...config.models[key], ...req.body };
  saveConfig(config);
  res.json({ success: true });
});

// 选择模型
app.post('/api/select', (req, res) => {
  const { model } = req.body;
  if (!config.models[model]) {
    return res.status(404).json({ error: '模型不存在' });
  }
  config.selectedModel = model;
  saveConfig(config);
  res.json({ success: true });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    models: Object.keys(config.models).length
  });
});

// ============ OpenAI 兼容接口 ============

// 列出模型 - 这是 Claude Code /model 命令调用的接口
app.get('/v1/models', (req, res) => {
  const modelList = Object.keys(config.models).map(key => {
    const model = config.models[key];
    return {
      id: key,
      object: 'model',
      created: Date.now(),
      owned_by: model.provider,
      name: model.name,
      // 添加这些字段让 Claude Code 能识别
      model: key,
      provider: model.provider,
      available: true,
      hasApiKey: !!model.apiKey,
      selected: key === config.selectedModel
    };
  });

  res.json({
    object: 'list',
    data: modelList
  });
});

// Chat completions
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    // 确定使用哪个模型
    let modelKey = model || config.selectedModel;
    
    // 处理 Claude Code 可能传递的模型名称
    if (modelKey && modelKey.includes('/')) {
      // 如果传递的是类似 "claude-3-opus" 这样的名字，映射到我们的模型
      const modelMap = {
        'claude-3-opus': 'zhipu-glm-4',
        'claude-3-sonnet': 'deepseek-chat',
        'claude-3-haiku': 'qwen-max'
      };
      if (modelMap[modelKey]) {
        modelKey = modelMap[modelKey];
      }
    }
    
    const modelConfig = config.models[modelKey];
    
    if (!modelConfig) {
      return res.status(404).json({
        error: { 
          message: `模型 "${modelKey}" 不存在。可用模型: ${Object.keys(config.models).join(', ')}`,
          type: 'invalid_request_error'
        }
      });
    }
    
    if (!modelConfig.apiKey) {
      return res.status(400).json({
        error: { 
          message: `请先在界面中配置 ${modelConfig.name} 的 API Key`,
          type: 'invalid_request_error'
        }
      });
    }

    console.log(`🤖 调用模型: ${modelConfig.name} (${modelConfig.provider})`);
    console.log(`📝 消息数: ${messages.length}`);

    let result;
    const provider = modelConfig.provider;

    try {
      if (provider === 'zhipu') {
        const response = await axios.post(modelConfig.apiUrl, {
          model: 'glm-4',
          messages: messages,
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 4096,
          stream: stream || false
        }, {
          headers: { 
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        });
        result = response.data;
      } else if (provider === 'deepseek') {
        const response = await axios.post(modelConfig.apiUrl, {
          model: 'deepseek-chat',
          messages: messages,
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 4096,
          stream: stream || false
        }, {
          headers: { 
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        });
        result = response.data;
      } else if (provider === 'alibaba') {
        const response = await axios.post(modelConfig.apiUrl, {
          model: 'qwen-max',
          messages: messages,
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 4096
        }, {
          headers: { 
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        });
        result = response.data;
      } else {
        throw new Error(`不支持的提供商: ${provider}`);
      }

      // 统一返回格式
      const response = {
        id: result.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelKey,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: result.choices?.[0]?.message?.content || result.response || ''
          },
          finish_reason: 'stop'
        }],
        usage: result.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

      res.json(response);

    } catch (apiError) {
      console.error('API 调用失败:', apiError.message);
      if (apiError.response) {
        console.error('响应数据:', apiError.response.data);
      }
      
      res.status(500).json({
        error: {
          message: apiError.response?.data?.error?.message || apiError.message,
          type: 'api_error'
        }
      });
    }

  } catch (error) {
    console.error('服务器错误:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'server_error'
      }
    });
  }
});

// ============ 启动服务器 ============

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  🚀 Model Gateway 服务已启动              ║');
  console.log('║                                            ║');
  console.log(`║  📡 地址: http://localhost:${PORT}          ║`);
  console.log(`║  📋 模型: ${Object.keys(config.models).join(', ')}`);
  console.log(`║  ✨ 当前: ${config.selectedModel}`);
  console.log('║                                            ║');
  console.log('║  💡 测试接口:                             ║');
  console.log(`║  curl http://localhost:${PORT}/v1/models   ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
});
