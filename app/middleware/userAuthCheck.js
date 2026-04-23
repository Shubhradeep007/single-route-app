const jwt = require('jsonwebtoken')

const userAuthCheck = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, msg: 'No token provided' })
    }
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ success: false, msg: 'Invalid or expired token' })
  }
}

module.exports = userAuthCheck
