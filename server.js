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

app.get('/api/models', (req, res) => {
  res.json({ models: config.models, selected: config.selectedModel });
});

app.post('/api/models/:key', (req, res) => {
  const { key } = req.params;
  if (!config.models[key]) return res.status(404).json({ error: '模型不存在' });
  config.models[key] = { ...config.models[key], ...req.body };
  saveConfig(config);
  res.json({ success: true });
});

app.post('/api/select', (req, res) => {
  const { model } = req.body;
  if (!config.models[model]) return res.status(404).json({ error: '模型不存在' });
  config.selectedModel = model;
  saveConfig(config);
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens } = req.body;
    const modelKey = model || config.selectedModel;
    const modelConfig = config.models[modelKey];
    
    if (!modelConfig) return res.status(404).json({ error: { message: '模型不存在' } });
    if (!modelConfig.apiKey) return res.status(400).json({ error: { message: '请配置 API Key' } });

    let result;
    if (modelConfig.provider === 'zhipu') {
      const response = await axios.post(modelConfig.apiUrl, {
        model: 'glm-4',
        messages: messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 4096
      }, {
        headers: { 'Authorization': `Bearer ${modelConfig.apiKey}` }
      });
      result = response.data;
    } else if (modelConfig.provider === 'deepseek') {
      const response = await axios.post(modelConfig.apiUrl, {
        model: 'deepseek-chat',
        messages: messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 4096
      }, {
        headers: { 'Authorization': `Bearer ${modelConfig.apiKey}` }
      });
      result = response.data;
    } else {
      throw new Error('不支持的提供商');
    }
    
    res.json({
      choices: [{ message: { role: 'assistant', content: result.choices?.[0]?.message?.content || '' } }],
      usage: result.usage || { total_tokens: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.response?.data?.error?.message || error.message } });
  }
});

app.get('/v1/models', (req, res) => {
  const data = Object.keys(config.models).map(key => ({
    id: key,
    object: 'model',
    created: Date.now(),
    owned_by: config.models[key].provider,
    name: config.models[key].name,
    hasApiKey: !!config.models[key].apiKey
  }));
  res.json({ object: 'list', data });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务已启动: http://localhost:${PORT}`);
  console.log(`📋 可用模型: ${Object.keys(config.models).join(', ')}`);
});
