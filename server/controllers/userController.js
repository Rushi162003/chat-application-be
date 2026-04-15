const User = require('../models/User')

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password')
        return res.status(200).json(users)
    }
    catch (error) {
        res.status(500).json({ message: 'Something went wrong' })
    }
}

exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password')
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        return res.status(200).json(user)
    }
    catch (error) {
        res.status(500).json({ message: 'Something went wrong' })
    }
}