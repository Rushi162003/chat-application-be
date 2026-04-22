const User = require('../models/User')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

exports.login = async (req, res) => {
    console.log("login request received", req.body)
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (!user) {
        return res.status(400).json({ message: 'User not found' })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
        return res.status(400).json({ message: 'Invalid password' })
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
    res.status(200).json({ message: 'Login successful', token })
}

exports.signup = async (req, res) => {
    const { name, email, password } = req.body
    const user = await User.findOne({ email })

    if (user) {
        return res.status(400).json({ message: 'User already exists' })
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        console.log("Hashed password: ", name, email)
        const newUser = await User.create({ name, email, password: hashedPassword })
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET)
        res.status(200).json({ message: 'Login successful', token })
    } catch (error) {
        console.log("Error in signup controller: ", error)
        res.status(500).json({ message: 'User creation failed' })
    }
}

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password')
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        return res.status(200).json(user)
    } catch (error) {
        console.log("Error in getMe controller: ", error)
        return res.status(500).json({ message: 'Something went wrong' })
    }
}