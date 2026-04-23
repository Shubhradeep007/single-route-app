const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const WriterModel = require('../models/writer')
const BlogModel = require('../models/blog')
const mongoose = require('mongoose')
const { notifyAdmins } = require('../config/websocket')

const buildBlogPipeline = (matchStage = null) => {
  const pipeline = []
  if (matchStage) pipeline.push({ $match: matchStage })

  pipeline.push(
    { $lookup: { from: 'admins', localField: 'author', foreignField: '_id', as: 'adminAuthor' } },
    { $lookup: { from: 'writers', localField: 'author', foreignField: '_id', as: 'writerAuthor' } },
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryInfo' } },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        author: {
          $cond: {
            if: { $eq: ['$authorModel', 'Writer'] },
            then: {
              _id: { $arrayElemAt: ['$writerAuthor._id', 0] },
              name: { $arrayElemAt: ['$writerAuthor.writerName', 0] },
              role: { $arrayElemAt: ['$writerAuthor.role', 0] },
            },
            else: {
              _id: { $arrayElemAt: ['$adminAuthor._id', 0] },
              name: { $arrayElemAt: ['$adminAuthor.adminName', 0] },
              role: { $arrayElemAt: ['$adminAuthor.role', 0] },
            },
          },
        },
        category: {
          $cond: {
            if: { $ifNull: ['$categoryInfo', false] },
            then: { _id: '$categoryInfo._id', name: '$categoryInfo.name' },
            else: null,
          },
        },
      },
    },
    { $project: { adminAuthor: 0, writerAuthor: 0, categoryInfo: 0 } },
    { $sort: { createdAt: -1 } },
  )

  return pipeline
}

class writerController {
  async writerLogin(req, res) {
    try {
      const { email, password } = req.body
      if (!email || !password) return res.status(400).json({ success: false, message: 'All fields are required' })
      const user = await WriterModel.findOne({ email })
      if (!user || user.role !== 'writer') return res.status(401).json({ success: false, message: 'Invalid credentials' })
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' })
      const writerAccessToken = jwt.sign(
        { userId: user._id, email: user.email, role: user.role, apiKey: user.apiKey },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' },
      )
      const writerRefreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: '7d' })
      user.refreshToken = writerRefreshToken
      await user.save()
      return res.status(200).json({
        success: true,
        message: 'Writer logged in successfully',
        writer: { userId: user._id, writerName: user.writerName, role: user.role },
        accessToken: writerAccessToken,
        refreshToken: writerRefreshToken,
      })
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Server error' })
    }
  }

  async writerRefreshToken(req, res) {
    try {
      const { refreshToken } = req.body
      if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' })
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY)
      const writer = await WriterModel.findById(decoded.userId)
      if (!writer || writer.refreshToken !== refreshToken) return res.status(403).json({ success: false, message: 'Invalid refresh token' })
      const newAccessToken = jwt.sign(
        { userId: writer._id, email: writer.email, role: writer.role, apiKey: writer.apiKey },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' },
      )
      return res.status(200).json({ success: true, accessToken: newAccessToken })
    } catch (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired refresh token' })
    }
  }

  async writerLogout(req, res) {
    try {
      const writer = await WriterModel.findById(req.writer._id)
      if (writer) { writer.refreshToken = null; await writer.save() }
      return res.status(200).json({ success: true, message: 'Logged out successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async blogOperations(req, res) {
    try {
      const method = req.method
      const { id } = req.params
      const writerId = req.writer._id

      switch (method) {
        case 'GET': {
          if (id) {
            const blogObjectId = mongoose.Types.ObjectId.createFromHexString(id)
            const [blog] = await BlogModel.aggregate(buildBlogPipeline({ _id: blogObjectId, author: writerId, authorModel: 'Writer' }))
            if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
            return res.status(200).json({ success: true, data: blog })
          }
          const blogs = await BlogModel.aggregate(buildBlogPipeline({ author: writerId, authorModel: 'Writer' }))
          return res.status(200).json({ success: true, count: blogs.length, data: blogs })
        }
        case 'POST': {
          const { title, content, excerpt, category } = req.body
          if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content are required' })
          const blog = await BlogModel.create({
            title, content, excerpt: excerpt || '', category: category || null,
            author: writerId, authorModel: 'Writer', status: 'pending',
          })
          notifyAdmins({ type: 'NEW_BLOG_SUBMISSION', message: `Writer "${req.writer.writerName}" submitted a new blog: "${blog.title}"`, blogId: blog._id, writerId })
          return res.status(201).json({ success: true, message: 'Blog submitted for review', data: blog })
        }
        case 'PUT': {
          if (!id) return res.status(400).json({ success: false, message: 'Blog ID required' })
          const blog = await BlogModel.findById(id)
          if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
          if (blog.author.toString() !== writerId.toString()) return res.status(403).json({ success: false, message: 'Not authorized to update this blog' })
          const { title, content, excerpt, category } = req.body
          if (title) blog.title = title
          if (content) blog.content = content
          if (excerpt !== undefined) blog.excerpt = excerpt
          if (category !== undefined) blog.category = category
          blog.status = 'pending'
          await blog.save()
          return res.status(200).json({ success: true, message: 'Blog updated', data: blog })
        }
        case 'DELETE': {
          if (!id) return res.status(400).json({ success: false, message: 'Blog ID required' })
          const blog = await BlogModel.findById(id)
          if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
          if (blog.author.toString() !== writerId.toString()) return res.status(403).json({ success: false, message: 'Not authorized to delete this blog' })
          await blog.deleteOne()
          return res.status(200).json({ success: true, message: 'Blog deleted' })
        }
        default:
          return res.status(405).json({ success: false, message: `Method ${method} not allowed` })
      }
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Something went wrong', error: err.message })
    }
  }
}

module.exports = new writerController()
