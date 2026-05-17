# Current focus

Discuss with me, with a critical eye, the current changes, based on the active task specified below. Check the current changes using `git diff main`.

Issues already found:

1. The adopt/create/locate/managed project dialogs in `@packages/frontend/src/pages/ProjectManagementPage/components/` use a custom `useMutation` hook to update the projects, instead of the generated orval hook.

2. When creating a new project, I can choose a folder, but there is no way of creating a new folder inside the existing folder, for the new project to be created in.

3. When creating a project, the folders on disk may be created successfully but the registry could still fail to update, leaving the files on disk but nothing in the registry.

Undesired flows:

1. The user has to choose between three options (adopt, create or use maskor-managed folder) when creating/registering projects. This should probably just be one option, where the user inputs a name and a path. The name is automatically derived from the path, if the user selects an existing project. The path is automatically set to a maskor-managed folder if the user just inputs name, without also specifying a path. All this could be one flow.

## Active spec

`@specifications/project-management.md`

## Active task(s)

`@tasks/prd-project-management.md`

## Key context
