module.exports = {
  preset: "ts-jest",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        jsx: "react-jsx",
        module: "CommonJS",
        target: "ES2020",
        esModuleInterop: true,
      },
    }],
  },
  testEnvironment: "node",
  // Adjust testMatch pattern if necessary to match your test file structure
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
};
