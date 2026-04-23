const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const AdminModel = require('../models/admin')
const WriterModel = require('../models/writer')
const BlogModel = require('../models/blog')
const CategoryModel = require('../models/category')
const { notifyWriter } = require('../config/websocket')

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

class adminController {
  async adminRegister(req, res) {
    try {
      const { adminName, email, password, phone } = req.body
      const exists = await AdminModel.findOne({ email })
      if (exists) return res.status(409).json({ success: false, message: 'Email already registered' })
      const hashed = await bcrypt.hash(password, 10)
      const hashedApiKey = await bcrypt.hash(process.env.ADMIN_BLOG_API_SECRET_KEY, 10)
      await AdminModel.create({ adminName, email, password: hashed, phone, apiKey: hashedApiKey })
      return res.status(201).json({ success: true, message: 'Admin created successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async adminLogin(req, res) {
    try {
      const { email, password } = req.body
      if (!email || !password) return res.status(400).json({ success: false, message: 'All fields are required' })
      const user = await AdminModel.findOne({ email })
      if (!user || user.role !== 'admin') return res.status(401).json({ success: false, message: 'Invalid credentials' })
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' })
      const adminAccessToken = jwt.sign(
        { userId: user._id, email: user.email, role: user.role, apiKey: user.apiKey },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' },
      )
      const adminRefreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: '7d' })
      user.refreshToken = adminRefreshToken
      await user.save()
      return res.status(200).json({
        success: true,
        message: 'Admin logged in successfully',
        admin: { userId: user._id, adminName: user.adminName, role: user.role },
        accessToken: adminAccessToken,
        refreshToken: adminRefreshToken,
      })
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Server error' })
    }
  }

  async adminRefreshToken(req, res) {
    try {
      const { refreshToken } = req.body
      if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' })
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY)
      const admin = await AdminModel.findById(decoded.userId)
      if (!admin || admin.refreshToken !== refreshToken) return res.status(403).json({ success: false, message: 'Invalid refresh token' })
      const newAccessToken = jwt.sign(
        { userId: admin._id, email: admin.email, role: admin.role, apiKey: admin.apiKey },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' },
      )
      return res.status(200).json({ success: true, accessToken: newAccessToken })
    } catch (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired refresh token' })
    }
  }

  async adminLogout(req, res) {
    try {
      const admin = await AdminModel.findById(req.admin.userId)
      if (admin) { admin.refreshToken = null; await admin.save() }
      return res.status(200).json({ success: true, message: 'Logged out successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async writerRegister(req, res) {
    try {
      const { writerName, email, password } = req.body
      const exists = await WriterModel.findOne({ email })
      if (exists) return res.status(409).json({ success: false, message: 'Email already registered' })
      const hashed = await bcrypt.hash(password, 10)
      const hashedApiKey = await bcrypt.hash(process.env.WRITER_BLOG_API_SECRET_KEY, 10)
      await WriterModel.create({ writerName, email, password: hashed, apiKey: hashedApiKey })
      return res.status(201).json({ success: true, message: 'Writer created successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async adminPasswordUpdate(req, res) {
    try {
      const { currentPassword, newPassword } = req.body
      if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'All fields are required' })
      if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      const admin = await AdminModel.findById(req.admin.userId)
      if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' })
      const isMatch = await bcrypt.compare(currentPassword, admin.password)
      if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect' })
      admin.password = await bcrypt.hash(newPassword, 10)
      await admin.save()
      return res.status(200).json({ success: true, message: 'Password updated successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async blogOperations(req, res) {
    try {
      const method = req.method
      const { id } = req.params

      switch (method) {
        case 'GET': {
          if (id) {
            const pipeline = buildBlogPipeline({ _id: require('mongoose').Types.ObjectId.createFromHexString(id) })
            const [blog] = await BlogModel.aggregate(pipeline)
            if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
            return res.status(200).json({ success: true, data: blog })
          }
          const blogs = await BlogModel.aggregate(buildBlogPipeline())
          return res.status(200).json({ success: true, count: blogs.length, data: blogs })
        }
        case 'POST': {
          const { title, content, excerpt, category } = req.body
          if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content are required' })
          const blog = await BlogModel.create({
            title, content, excerpt: excerpt || '', category: category || null,
            author: req.admin.userId, authorModel: 'Admin', status: 'draft',
          })
          return res.status(201).json({ success: true, message: 'Blog created', data: blog })
        }
        case 'PUT': {
          if (!id) return res.status(400).json({ success: false, message: 'Blog ID required' })
          const blog = await BlogModel.findById(id)
          if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
          const { title, content, excerpt, category, status } = req.body
          if (title) blog.title = title
          if (content) blog.content = content
          if (excerpt !== undefined) blog.excerpt = excerpt
          if (category !== undefined) blog.category = category
          if (status) blog.status = status
          await blog.save()
          return res.status(200).json({ success: true, message: 'Blog updated', data: blog })
        }
        case 'DELETE': {
          if (!id) return res.status(400).json({ success: false, message: 'Blog ID required' })
          const blog = await BlogModel.findById(id)
          if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
          await BlogModel.findByIdAndDelete(id)
          return res.status(200).json({ success: true, message: 'Blog deleted' })
        }
        default:
          return res.status(405).json({ success: false, message: `Method ${method} not allowed` })
      }
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Something went wrong', error: err.message })
    }
  }

  async approveAndPublishBlog(req, res) {
    try {
      const { blogId } = req.params
      const blog = await BlogModel.findById(blogId)
      if (!blog) return res.status(404).json({ success: false, msg: 'Blog not found' })
      if (blog.authorModel !== 'Writer') return res.status(400).json({ success: false, msg: 'Only writer blogs need approval' })
      if (blog.status === 'published') return res.status(400).json({ success: false, msg: 'Blog already published' })
      if (blog.status === 'rejected') return res.status(400).json({ success: false, msg: 'Rejected blogs cannot be published directly' })
      blog.status = 'published'
      blog.approvedBy = req.admin.userId
      blog.publishedAt = new Date()
      await blog.save()
      notifyWriter(blog.author.toString(), { type: 'BLOG_APPROVED', message: `Your blog "${blog.title}" has been approved and published!`, blogId: blog._id })
      return res.status(200).json({ success: true, message: 'Blog approved and published', data: blog })
    } catch (err) {
      return res.status(500).json({ success: false, msg: 'Failed to approve blog', error: err.message })
    }
  }

  async rejectBlog(req, res) {
    try {
      const { blogId } = req.params
      const blog = await BlogModel.findById(blogId)
      if (!blog) return res.status(404).json({ success: false, msg: 'Blog not found' })
      if (blog.authorModel !== 'Writer') return res.status(400).json({ success: false, msg: 'Only writer blogs can be rejected' })
      if (blog.status === 'published') return res.status(400).json({ success: false, msg: 'Published blogs cannot be rejected' })
      blog.status = 'rejected'
      blog.approvedBy = req.admin.userId
      await blog.save()
      notifyWriter(blog.author.toString(), { type: 'BLOG_REJECTED', message: `Your blog "${blog.title}" has been rejected.`, blogId: blog._id })
      return res.status(200).json({ success: true, message: 'Blog rejected', data: blog })
    } catch (err) {
      return res.status(500).json({ success: false, msg: 'Failed to reject blog', error: err.message })
    }
  }

  async getCategories(req, res) {
    try {
      const categories = await CategoryModel.find({ isActive: true }).sort({ name: 1 })
      return res.status(200).json({ success: true, count: categories.length, data: categories })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async createCategory(req, res) {
    try {
      const { name, description } = req.body
      if (!name) return res.status(400).json({ success: false, message: 'Category name is required' })
      const existing = await CategoryModel.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } })
      if (existing) return res.status(409).json({ success: false, message: 'Category already exists' })
      const category = await CategoryModel.create({ name, description: description || '', createdBy: req.admin.userId })
      return res.status(201).json({ success: true, message: 'Category created', data: category })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async deleteCategory(req, res) {
    try {
      const { id } = req.params
      const category = await CategoryModel.findById(id)
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' })
      category.isActive = false
      await category.save()
      return res.status(200).json({ success: true, message: 'Category deactivated' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }
}

module.exports = new adminController()
