module.exports = {
  root: false,
  env: {
    browser: true,
    mocha: true,
    es6: true,
    jest: true,
    node: true
  },

  parser: '@typescript-eslint/parser',

  plugins: [
    '@typescript-eslint',
  ],

  globals: {
    expect: true
  },

  rules: {
    'semi': ['error', 'always'],
    'indent': 'off',
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/no-explicit-any': ['off'],

    'quotes': 'off',
    '@typescript-eslint/quotes': ['error', 'single']

  },


  overrides: [
    {
      files: ['*.ts'],

    }
  ]
}
