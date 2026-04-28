const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const UserModel = require('../models/user')
const BlogModel = require('../models/blog')
const CommentModel = require('../models/comments')
const CategoryModel = require('../models/category')
const mongoose = require('mongoose')
const { notifyWriter } = require('../config/websocket')

const buildPublicBlogPipeline = (matchStage = null) => {
  const pipeline = []
  const baseMatch = { status: 'published' }
  if (matchStage) {
    pipeline.push({ $match: { ...baseMatch, ...matchStage } })
  } else {
    pipeline.push({ $match: baseMatch })
  }

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
            },
            else: {
              _id: { $arrayElemAt: ['$adminAuthor._id', 0] },
              name: { $arrayElemAt: ['$adminAuthor.adminName', 0] },
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
        likesCount: { $size: '$likes' },
      },
    },
    { $project: { adminAuthor: 0, writerAuthor: 0, categoryInfo: 0 } },
    { $sort: { publishedAt: -1 } },
  )

  return pipeline
}

class userController {
  async userRegister(req, res) {
    try {
      const { userName, email, password } = req.body
      const exists = await UserModel.findOne({ email })
      if (exists) return res.status(409).json({ success: false, message: 'Email already registered' })
      const hashed = await bcrypt.hash(password, 10)
      await UserModel.create({ userName, email, password: hashed })
      return res.status(201).json({ success: true, message: 'User registered successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async userLogin(req, res) {
    try {
      const { email, password } = req.body
      if (!email || !password) return res.status(400).json({ success: false, message: 'All fields are required' })
      const user = await UserModel.findOne({ email })
      if (!user || user.role !== 'user') return res.status(401).json({ success: false, message: 'Invalid credentials' })
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' })
      const userAccessToken = jwt.sign(
        { userId: user._id, userName: user.userName, email: user.email, role: user.role },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' },
      )
      const userRefreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: '7d' })
      user.refreshToken = userRefreshToken
      await user.save()
      return res.status(200).json({
        success: true,
        message: 'User logged in successfully',
        user: { userId: user._id, userName: user.userName, role: user.role },
        accessToken: userAccessToken,
        refreshToken: userRefreshToken,
      })
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Server error' })
    }
  }

  async userRefreshToken(req, res) {
    try {
      const { refreshToken } = req.body
      if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' })
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY)
      const user = await UserModel.findById(decoded.userId)
      if (!user || user.refreshToken !== refreshToken) return res.status(403).json({ success: false, message: 'Invalid refresh token' })
      const newAccessToken = jwt.sign(
        { userId: user._id, userName: user.userName, email: user.email, role: user.role },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' },
      )
      return res.status(200).json({ success: true, accessToken: newAccessToken })
    } catch (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired refresh token' })
    }
  }

  async userLogout(req, res) {
    try {
      const user = await UserModel.findById(req.user.userId)
      if (user) { user.refreshToken = null; await user.save() }
      return res.status(200).json({ success: true, message: 'Logged out successfully' })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async publicBlogOperations(req, res) {
    try {
      const method = req.method
      const { id } = req.params
      if (method !== 'GET') return res.status(403).json({ success: false, message: 'Public users can only read blogs' })
      if (id) {
        const blogObjectId = mongoose.Types.ObjectId.createFromHexString(id)
        const [blog] = await BlogModel.aggregate(buildPublicBlogPipeline({ _id: blogObjectId }))
        if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
        return res.status(200).json({ success: true, data: blog })
      }
      const blogs = await BlogModel.aggregate(buildPublicBlogPipeline())
      return res.status(200).json({ success: true, count: blogs.length, data: blogs })
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Something went wrong', error: err.message })
    }
  }

  async likeBlog(req, res) {
    try {
      const { id } = req.params
      const userId = req.user.userId

      const blog = await BlogModel.findById(id)
      if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
      if (blog.status !== 'published') return res.status(403).json({ success: false, message: 'Cannot like an unpublished blog' })

      const alreadyLiked = blog.likes.some((uid) => uid.toString() === userId.toString())

      if (alreadyLiked) {
        blog.likes = blog.likes.filter((uid) => uid.toString() !== userId.toString())
        await blog.save()
        if (blog.authorModel === 'Writer') {
          notifyWriter(blog.author.toString(), {
            type: 'BLOG_UNLIKED',
            message: `Someone removed their like from your blog "${blog.title}"`,
            blogId: blog._id,
          })
        }
        return res.status(200).json({ success: true, message: 'Like removed', likesCount: blog.likes.length })
      } else {
        blog.likes.push(userId)
        await blog.save()
        if (blog.authorModel === 'Writer') {
          notifyWriter(blog.author.toString(), {
            type: 'BLOG_LIKED',
            message: `Someone liked your blog "${blog.title}"`,
            blogId: blog._id,
          })
        }
        return res.status(200).json({ success: true, message: 'Blog liked', likesCount: blog.likes.length })
      }
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async commentOnBlog(req, res) {
    try {
      const { id } = req.params
      const userId = req.user.userId
      const { content } = req.body

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, message: 'Comment content is required' })
      }

      const blog = await BlogModel.findById(id)
      if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
      if (blog.status !== 'published') return res.status(403).json({ success: false, message: 'Cannot comment on an unpublished blog' })

      const comment = await CommentModel.create({ blog: id, user: userId, content: content.trim() })
      const populated = await comment.populate('user', 'userName')

      if (blog.authorModel === 'Writer') {
        notifyWriter(blog.author.toString(), {
          type: 'NEW_COMMENT',
          message: `New comment on your blog "${blog.title}"`,
          blogId: blog._id,
          commentId: comment._id,
        })
      }

      return res.status(201).json({ success: true, message: 'Comment added', data: populated })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
    }
  }

  async getBlogComments(req, res) {
    try {
      const { id } = req.params

      const blog = await BlogModel.findById(id)
      if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' })
      if (blog.status !== 'published') return res.status(403).json({ success: false, message: 'Blog not accessible' })

      const comments = await CommentModel.find({ blog: id })
        .populate('user', 'userName')
        .sort({ createdAt: -1 })

      return res.status(200).json({ success: true, count: comments.length, data: comments })
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message })
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
}

module.exports = new userController()
