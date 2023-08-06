const { Sequelize } = require('sequelize')

exports.init = async () => {
  let sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      dialect: 'mysql',
      dialectOptions: {
        ssl: {
          key: process.env.SSL_KEY,
          cert: process.env.SSL_CERT,
          ca: process.env.SSL_CA
        },
      },
    }
  )

  try {
    await sequelize.authenticate()
    console.log('Sequelize started successfully')
    return sequelize
  } catch (error) {
    console.log('There was a problem with Sequelize')
    return Promise.reject(error)
  }
}
