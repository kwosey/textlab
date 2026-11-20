# Working on Text Lab

- Work in the existing checkout. Codex cloud tasks already run in isolated environments.
- Keep document edits immutable and preserve the separation between source text, beat editing, and presentation.
- Derive rendering from the document and an explicit timestamp. Use the same drawing path for preview and image export.
- Maintain the versioned JSON contract. Update the example and import tests when changing it.
- Confirm a change in the main editor at desktop and phone widths. Run the commands in TESTING.md before handing off.
- Keep the editor standalone. It must run without API keys or other projects. Preserve the distinction between a Preview and a production deployment.
