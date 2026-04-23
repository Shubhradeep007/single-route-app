const express = require('express');
const router = express.Router();

const adminRoute  = require('./adminRoute');
const userRoute   = require('./userRoute');
const writerRoute = require('./writerRoute');

router.use('/admin',  adminRoute);
router.use('/user',   userRoute);
router.use('/writer', writerRoute);

module.exports = router;
