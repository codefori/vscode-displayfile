/** @type {{[ind: number]: boolean}} */
exports.values = {};

exports.initialize = () => {
  for (let i = 1; i <= 99; i++) {
    this.values[i] = false;
  }
}