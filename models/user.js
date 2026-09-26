const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Counter = require('./counter');

// FIX (ревью, п.3): bcrypt использует только первые 72 БАЙТА пароля, всё,
// что дальше, тихо игнорируется при хешировании. Без этой проверки пароль
// длиннее 72 байт принимался бы, но сравнение по факту шло только по первым
// 72 байтам — 'x'.repeat(72)+'correct' и 'x'.repeat(72)+'WRONG' считались
// бы одним и тем же паролем.
const MAX_PASSWORD_BYTES = 72;

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'staff'],
      default: 'owner',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function () {
  // Генерация автоинкрементного userId
  if (this.isNew && !this.userId) {
    const counter = await Counter.findOneAndUpdate(
      { id: 'userId' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );

    if (!counter) {
      throw new Error('Failed to generate userId: Counter document was not returned');
    }

    this.userId = counter.seq;
  }

  if (this.isModified('password')) {
    // Считаем длину в БАЙТАХ (Buffer.byteLength), а не в символах —
    // многобайтовые UTF-8 символы иначе позволят обойти проверку.
    if (Buffer.byteLength(this.password, 'utf8') > MAX_PASSWORD_BYTES) {
      const error = new mongoose.Error.ValidationError();
      error.errors.password = new mongoose.Error.ValidatorError({
        message: `Пароль не должен превышать ${MAX_PASSWORD_BYTES} байт`,
        path: 'password',
        value: undefined
      });
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);