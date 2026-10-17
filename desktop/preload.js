'use strict';
// Ponte mínima entre a página e o processo principal: login do usuário, administração de contas, partidas,
// estatísticas e tutor de IA.
// O token de login e as chaves das IAs nunca chegam à página: o processo principal guarda o token
// e manda as chamadas para a API (pasta api/), que guarda as chaves.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lanceDesktop', {
  ai: {
    // a API escolhe o provedor (Gemini, DeepSeek ou OpenRouter) e troca sozinha quando um falha
    provider: 'api',
    status: () => ipcRenderer.invoke('ai:status'),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  },
  auth: {
    login: (data) => ipcRenderer.invoke('auth:login', data),
    register: (data) => ipcRenderer.invoke('auth:register', data),
    me: () => ipcRenderer.invoke('auth:me'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    updateMe: (data) => ipcRenderer.invoke('users:update-me', data),
    // a API recusou a sessão (expirada, conta desativada ou bloqueada)
    onExpired: (cb) => { ipcRenderer.on('auth:expired', (_e, info) => cb(info || {})); },
  },
  // só funciona para administradores (a API responde 403 para jogadores)
  admin: {
    listUsers: (params) => ipcRenderer.invoke('admin:list-users', params),
    getUser: (id) => ipcRenderer.invoke('admin:get-user', id),
    createUser: (data) => ipcRenderer.invoke('admin:create-user', data),
    updateUser: (id, data) => ipcRenderer.invoke('admin:update-user', id, data),
    deleteUser: (id) => ipcRenderer.invoke('admin:delete-user', id),
    listRoles: () => ipcRenderer.invoke('admin:list-roles'),
  },
  // partidas do usuário logado (a API calcula a pontuação na conclusão)
  games: {
    create: (data) => ipcRenderer.invoke('games:create', data),
    update: (id, data) => ipcRenderer.invoke('games:update', id, data),
    list: (params) => ipcRenderer.invoke('games:list', params),
    get: (id) => ipcRenderer.invoke('games:get', id),
    remove: (id) => ipcRenderer.invoke('games:delete', id),
  },
  // estatísticas e evolução da pontuação ({from, to, group: 'day'|'week'|'month', tz})
  stats: {
    me: (params) => ipcRenderer.invoke('stats:me', params),
    ratingHistory: (params) => ipcRenderer.invoke('stats:rating-history', params),
  },
});
