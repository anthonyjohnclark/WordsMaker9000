#!/bin/sh
# Run inside the prepared image from an isolated writable directory.
set -eu
cp /repository/package.json /repository/package-lock.json .
mkdir -p src-tauri
cp /repository/src-tauri/Cargo.lock src-tauri/Cargo.lock
wordsmaker9000-prepare
npm ci --offline --no-audit --no-fund
node -e "require('jest-environment-jsdom'); require('@testing-library/react'); console.log('DOM test packages imported')"
cat > dom-smoke.test.cjs <<'TEST'
/** @jest-environment jsdom */
const React = require('react');
const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
afterEach(cleanup);
test('prepared DOM environment renders React and handles an interaction', () => {
  function Counter() {
    const [count, setCount] = React.useState(0);
    return React.createElement('button', { onClick: () => setCount(count + 1) }, String(count));
  }
  render(React.createElement(Counter));
  fireEvent.click(screen.getByRole('button', { name: '0' }));
  expect(screen.getByRole('button', { name: '1' }).textContent).toBe('1');
});
TEST
node node_modules/jest/bin/jest.js --config '{"testMatch":["**/dom-smoke.test.cjs"],"testEnvironment":"node"}' --runInBand
