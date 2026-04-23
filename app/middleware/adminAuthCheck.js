const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const adminAuthCheck = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, msg: 'No token provided' })
    }
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY)
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, msg: 'Not an admin' })
    }
    req.admin = decoded
    next()
  } catch (err) {
    return res.status(401).json({ success: false, msg: 'Invalid or expired token' })
  }
}

const verifyAdminApiKey = async (req, res, next) => {
  try {
    const secretKey = req.headers['x-secret-key']
    if (!secretKey) {
      return res.status(401).json({ success: false, msg: 'x-secret-key header missing' })
    }
    const apiKey = req.admin?.apiKey
    if (!apiKey) {
      return res.status(401).json({ success: false, msg: 'API key not found in token' })
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

module.exports = { adminAuthCheck, verifyAdminApiKey }
