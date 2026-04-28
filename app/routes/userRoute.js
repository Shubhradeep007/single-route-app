const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')
const userAuthCheck = require('../middleware/userAuthCheck')

router.route('/register')
  .post(userController.userRegister)

router.route('/login')
  .post(userController.userLogin)

router.route('/logout')
  .post(userAuthCheck, userController.userLogout)

router.route('/refresh-token')
  .post(userController.userRefreshToken)

router.route('/category')
  .get(userController.getCategories)

router.route('/blog')
  .get(userController.publicBlogOperations)

router.route('/blog/:id')
  .get(userController.publicBlogOperations)

router.route('/blog/:id/like')
  .post(userAuthCheck, userController.likeBlog)

router.route('/blog/:id/comments')
  .get(userController.getBlogComments)
  .post(userAuthCheck, userController.commentOnBlog)

module.exports = router
