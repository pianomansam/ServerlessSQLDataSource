module.exports = {
  parser: 'babel-eslint',
  extends: [
    'react-app',
    'eslint-config-airbnb-base',
    'plugin:prettier/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  env: {
    jest: true,
  },
  rules: {
    'global-require': 0,
    'no-restricted-syntax': 0,
    'no-await-in-loop': 0,
    'no-return-assign': 0,
    'class-methods-use-this': 0,
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
      },
    ],
  },
};
