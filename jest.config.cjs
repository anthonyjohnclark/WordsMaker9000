module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { jsx: "react-jsx" } },
    ],
  },
  // Adjust testMatch pattern if necessary to match your test file structure
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
};
