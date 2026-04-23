const express = require('express')
const router = express.Router()
const writerController = require('../controllers/writerController')
const { writerAuthCheck, verifyWriterApiKey } = require('../middleware/writerAuthCheck')

router.route('/login')
  .post(writerController.writerLogin)

router.route('/logout')
  .post(writerAuthCheck, writerController.writerLogout)

router.route('/refresh-token')
  .post(writerController.writerRefreshToken)

router.route('/blog')
  .get(writerAuthCheck, verifyWriterApiKey, writerController.blogOperations)
  .post(writerAuthCheck, verifyWriterApiKey, writerController.blogOperations)

router.route('/blog/:id')
  .get(writerAuthCheck, verifyWriterApiKey, writerController.blogOperations)
  .put(writerAuthCheck, verifyWriterApiKey, writerController.blogOperations)
  .delete(writerAuthCheck, verifyWriterApiKey, writerController.blogOperations)

module.exports = router
