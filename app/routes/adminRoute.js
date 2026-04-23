const express = require('express')
const router = express.Router()
const adminController = require('../controllers/adminController')
const { adminAuthCheck, verifyAdminApiKey } = require('../middleware/adminAuthCheck')

router.route('/register')
  .post(adminController.adminRegister)

router.route('/login')
  .post(adminController.adminLogin)

router.route('/logout')
  .post(adminAuthCheck, adminController.adminLogout)

router.route('/refresh-token')
  .post(adminController.adminRefreshToken)

router.route('/create-writer')
  .post(adminAuthCheck, adminController.writerRegister)

router.route('/update-password')
  .post(adminAuthCheck, adminController.adminPasswordUpdate)

router.route('/blog/approval/:blogId')
  .post(adminAuthCheck, verifyAdminApiKey, adminController.approveAndPublishBlog)

router.route('/blog/reject/:blogId')
  .post(adminAuthCheck, verifyAdminApiKey, adminController.rejectBlog)

router.route('/category')
  .get(adminAuthCheck, adminController.getCategories)
  .post(adminAuthCheck, adminController.createCategory)

router.route('/category/:id')
  .delete(adminAuthCheck, adminController.deleteCategory)

router.route('/blog')
  .get(adminAuthCheck, verifyAdminApiKey, adminController.blogOperations)
  .post(adminAuthCheck, verifyAdminApiKey, adminController.blogOperations)

router.route('/blog/:id')
  .get(adminAuthCheck, verifyAdminApiKey, adminController.blogOperations)
  .put(adminAuthCheck, verifyAdminApiKey, adminController.blogOperations)
  .delete(adminAuthCheck, verifyAdminApiKey, adminController.blogOperations)

module.exports = router
