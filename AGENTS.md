# Git workflow

- Use GitHub Flow: create a descriptive topic branch from `main`, commit changes
  there, and open a pull request targeting `main`.
- Use Conventional Commit subjects, such as `fix:`, `feat:`, `test:`, and `docs:`;
  add a scope when it makes the change clearer, for example `fix(deps):`.
- Describe the resulting behavior and relevant validation in pull requests.
- Use annotated Git tags for releases or meaningful milestones, rather than
  tagging every commit. Use `vX.Y.Z` for releases matching `package.json`.
- Before submitting changes, run the checks relevant to them. For invoice or
  persistence changes, run `npm test` and `npm run build`; for dependency changes,
  also run `npm audit`.
