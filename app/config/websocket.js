const WebSocket = require('ws')

let wss = null

const setupWebSocket = (server) => {
  wss = new WebSocket.Server({ server })

  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message)
        if (data.type === 'identify') {
          ws.role = data.role
          ws.userId = data.userId
        }
      } catch (err) {
        console.error('[WS] Bad message:', err.message)
      }
    })
  })
}

const notifyRole = (role, payload, targetUserId = null) => {
  if (!wss) return
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return
    if (client.role !== role) return
    if (targetUserId && client.userId !== targetUserId) return
    client.send(JSON.stringify(payload))
  })
}

const notifyAdmins = (payload) => notifyRole('admin', payload)
const notifyWriter = (writerId, payload) => notifyRole('writer', payload, writerId)

module.exports = { setupWebSocket, notifyAdmins, notifyWriter }
