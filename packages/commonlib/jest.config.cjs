const { makeConfig } = require("../root/jest.base");
const pkg = require('./package.json');

module.exports = makeConfig(pkg);
