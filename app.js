require('dotenv').config()
const express = require('express')
const morgan = require('morgan')
const helmet = require('helmet')
const cookieparser = require('cookie-parser')
const http = require('http')

const ConnectDatabase = require('./app/config/dbconfig')
ConnectDatabase()

const app = express()
const { setupWebSocket } = require('./app/config/websocket')
const server = http.createServer(app)
setupWebSocket(server)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'))
app.use(helmet({ contentSecurityPolicy: false, xDownloadOptions: false }))
app.use(cookieparser())

app.use(require('./app/routes/index'))

const port = process.env.PORT || 5005

server.listen(port, (err) => {
  if (err) console.log(`failed to start the server ${err}`)
  console.log(`Server running on http://localhost:${port}`)
})
