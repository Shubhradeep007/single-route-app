const WriterModel = require('../models/writer')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const writerAuthCheck = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, msg: 'No token provided' })
    }
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY)
    if (decoded.role !== 'writer') {
      return res.status(403).json({ success: false, msg: 'Not a writer' })
    }
    const writer = await WriterModel.findById(decoded.userId)
    if (!writer) {
      return res.status(401).json({ success: false, msg: 'Writer not found' })
    }
    req.writer = writer
    next()
  } catch (err) {
    console.error('WRITER AUTH ERROR:', err.message)
    return res.status(401).json({ success: false, msg: 'Invalid or expired token' })
  }
}

const verifyWriterApiKey = async (req, res, next) => {
  try {
    const secretKey = req.headers['x-secret-key']
    if (!secretKey) {
      return res.status(401).json({ success: false, msg: 'x-secret-key header missing' })
    }
    const apiKey = req.writer?.apiKey
    if (!apiKey) {
      return res.status(401).json({ success: false, msg: 'API key not found for this writer' })
    }
    const isMatch = await bcrypt.compare(secretKey, apiKey)
    if (!isMatch) {
      return res.status(403).json({ success: false, msg: 'Invalid secret key' })
    }
    next()
  } catch (err) {
    return res.status(500).json({ success: false, msg: 'Server error', error: err.message })
  }
}

module.exports = { writerAuthCheck, verifyWriterApiKey }
