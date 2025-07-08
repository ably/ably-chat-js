# Contributing To Chat SDK

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Ensure you have added suitable tests and the test suite is passing(`npm test`)
5. Push the branch (`git push origin my-new-feature`)
6. Create a new Pull Request

## Release Process

1. Make sure the tests are passing in CI for main
2. Add a new commit using Semantic Versioning rules.
   1. [Semantic Versioning guidelines](https://semver.org/) entail a format of M.m.p, for example 1.2.3, where:
      - The first number represents a major release, which lets users know a breaking change has occurred that will require action from them.
      - A major update in the AblyJS SDK will also require a major update in the Chat SDK.
      - The second number represents a minor release, which lets users know new functionality or features have been added.
      - The third number represents a patch release, which represents bug-fixes and may be used when no action should be required from users.
   2. The commit should update `package.json` and `package-lock.json`. Running `npm install` after changing `package.json` will update `package-lock.json`.
   3. Also run `npm install` in the `demo/` folder to update the dependency version there.
   4. The commit should also update `version.ts` to set the agent headers.
   5. Update the `CHANGELOG.md` with any customer-affecting changes since the last release.
   6. Update the README.md for any references to the new version.
   7. If making breaking changes, add steps to upgrade to the `UPGRADING.md`.
3. Merge the commit into main.
4. Tag a release using [Github releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release). The version needs to match the one from the commit. Use the "Generate release notes" button to
   add changelog notes and update as required.
5. Ensure that the NPM Publish and CDN Deploy actions have run successfully.
6. Update [`@ably/cli`](https://github.com/ably/cli). This SDK is used to power Chat interactions on the Ably CLI, so please update the Chat SDK version for that repo if necessary (e.g. new features, bug fixes).

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
