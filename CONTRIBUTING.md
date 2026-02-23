# Contributing To Chat SDK

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Ensure you have added suitable tests and the test suite is passing(`npm test`)
5. Push the branch (`git push origin my-new-feature`)
6. Create a new Pull Request

## Validate website doc snippets

To validate that the web documentation code snippets are accurate and up-to-date with the SDK source code, run the following prompts against a locally cloned copy of the [ably/docs](https://github.com/ably/docs) repository and this SDK repository.

> [!IMPORTANT]
> These prompts should be run with the most powerful LLM available to you (e.g. Claude Opus, GPT-5, etc.) for the best results.

Replace `{DOCS_PATH}` with the path to your local clone of the [ably/docs](https://github.com/ably/docs) repository and `{SDK_PATH}` with the path to your local clone of this SDK repository.

### JavaScript

```text
Verify all `javascript` annotated code snippets in `.mdx` files located at `{DOCS_PATH}` against the `ably-chat-js` source code repository at `{SDK_PATH}`.

### Verification Steps:

1. **Find all code snippets**: Search for all code blocks with the `javascript` annotation in `.mdx` files.

2. **Understand SDK structure**: Analyze the SDK source code to understand:
   - Public classes and their constructors
   - Public methods and their signatures (parameters, return types)
   - Public properties and their types
   - Enums and their values
   - Namespaces and import requirements

3. **Cross-check each snippet** for the following issues:
   - **Syntax errors**: Incorrect constructor calls, missing or extra arguments, mismatched brackets or parentheses
   - **Naming conventions**: Verify casing matches JavaScript conventions (e.g., `PascalCase` for classes, `camelCase` for methods and properties)
   - **API accuracy**: Verify method names, property names, and enum values exist in the SDK
   - **Type correctness**: Verify correct types are used (e.g., correct event names, option keys)
   - **Namespace/import requirements**: Note any required imports that are missing from examples
   - **Wrong language**: Detect if code from another language was accidentally used

4. **Generate a verification report** with:
   - Total snippets found
   - List of issues found with:
     - File path and line number
     - Current (incorrect) code
     - Expected (correct) code
     - Source reference in SDK
   - List of verified APIs that are correct
   - Success rate percentage
   - Recommendations for fixes

### Output Format:
Create/update a markdown report file `chat_javascript_api_verification_report.md` with all findings.
```

### React

```text
Verify all `react` annotated code snippets in `.mdx` files located at `{DOCS_PATH}` against the `ably-chat-js` source code repository at `{SDK_PATH}`.

### Verification Steps:

1. **Find all code snippets**: Search for all code blocks with the `react` annotation in `.mdx` files.

2. **Understand SDK structure**: Analyze the SDK source code to understand:
   - Public React hooks and their signatures (parameters, return types)
   - Public React components and their props
   - Public context providers and their usage
   - Exported types and interfaces
   - Namespaces and import requirements

3. **Cross-check each snippet** for the following issues:
   - **Syntax errors**: Incorrect hook calls, missing or extra arguments, mismatched JSX tags, incorrect destructuring
   - **Naming conventions**: Verify casing matches React conventions (e.g., `PascalCase` for components, `camelCase` for hooks and props, `use` prefix for hooks)
   - **API accuracy**: Verify hook names, component names, prop names, and return values exist in the SDK
   - **Type correctness**: Verify correct types are used (e.g., correct option keys, callback signatures)
   - **Namespace/import requirements**: Note any required imports that are missing from examples (e.g., `@ably/chat/react`)
   - **Wrong language**: Detect if code from another language was accidentally used

4. **Generate a verification report** with:
   - Total snippets found
   - List of issues found with:
     - File path and line number
     - Current (incorrect) code
     - Expected (correct) code
     - Source reference in SDK
   - List of verified APIs that are correct
   - Success rate percentage
   - Recommendations for fixes

### Output Format:
Create/update a markdown report file `chat_react_api_verification_report.md` with all findings.
```

## Release Process

1. Make sure the tests are passing in CI for main.
2. Add a new commit using Semantic Versioning rules.
   1. [Semantic Versioning guidelines](https://semver.org/) entail a format of M.m.p, for example 1.2.3, where:
      - The first number represents a major release, which lets users know a breaking change has occurred that will require action from them.
      - A major update in the AblyJS SDK will also require a major update in the Chat SDK.
      - The second number represents a minor release, which lets users know new functionality or features have been added.
      - The third number represents a patch release, which represents bug-fixes and may be used when no action should be required from users.
   2. The commit should update `package.json` and `package-lock.json`. Running `npm install` after changing `package.json` will update `package-lock.json`.
   3. Delete the `node_modules` in the `demo/` folder and then run `npm install` to update the dependency version there.
   4. The commit should also update `version.ts` to set the agent headers.
   5. Update the `CHANGELOG.md` with any customer-affecting changes since the last release.
   6. Update the README.md for any references to the new version.
   7. If making breaking changes, add steps to upgrade to the `UPGRADING.md`.
3. Merge the commit into main.
4. Tag a release using [Github releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release). The version needs to match the one from the commit. Use the "Generate release notes" button to
   add changelog notes and update as required.
5. Ensure that the NPM Publish and CDN Deploy actions have run successfully.
6. If you've deprecated any public methods or properties, changed public interfaces, or are uncertain about the impact of your updates, run the [Validate website doc snippets](#validate-website-doc-snippets) task locally. This will verify that the `javascript` and `react` code snippets in the web documentation (https://github.com/ably/docs) are accurate and aligned with the current SDK source. Review the generated reports and address any issues they identify.
7. Create a PR on the [website docs](https://github.com/ably/docs) that updates the SDK version:
   1. Update the JS and React version for the chat language selector in [src/data/languages/languageData.ts](https://github.com/ably/docs/blob/main/src/data/languages/languageData.ts#L25-L26).
   2. Update the version used by the [examples](https://github.com/ably/docs/blob/main/examples/package.json), and the examples code if needed.
      - you can do this by running `yarn upgrade @ably/chat@latest` from the `examples` folder
   3. Update [ExamplesRenderer](https://github.com/ably/docs/blob/main/src/components/Examples/ExamplesRenderer.tsx#L45) `src/components/Examples/ExamplesRenderer.tsx`
   4. Additionally, include fixes for any documentation issues identified in the previous step.
8. Merge any [website docs](https://github.com/ably/docs) PRs related to the changes.
9. Update [`@ably/cli`](https://github.com/ably/cli). This SDK is used to power Chat interactions on the Ably CLI, so please update the Chat SDK version for that repo if necessary (e.g. new features, bug fixes).

## Running The Test Suite

To run the tests, just run:

```shell
npm run test
```

By default, the test suite runs against Ably's sandbox environment using short-lived credentials. If you just want to run the test
suite, then you don't need to do anything to get set up.

If you're developing against a local build of the realtime system, please copy the `.env.test.example` file to `.env.test` and fill
in the blanks. This will allow you run the unit tests against your local development environment, or the production cluster if you wish.

## Formatting and Linting

This repository makes use of Prettier and ESLint for formatting and linting respectively. The rules are enforced in CI, so please
make sure you run the checks before pushing your code. You can do this by running:

```shell
npm run format # Format all files
npm run format:check # Check for formatting errors but do not fix
npm run lint # Check for linting errors but do not fix
npm run lint:fix # Check for linting errors and fix
```
