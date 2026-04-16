# Workspace Roles — DreamWare AI Studio

> Created in Phase 1. Updated as permissions change.

## Two-dimension permission model

DreamWare now has two independent permission axes:

### Dimension A — Platform role (`profiles.role`)

| Role | Meaning |
|---|---|
| `admin` | Superadmin (Andrés). Can do everything, everywhere. |
| `team` | DreamWare staff. Can create workspaces, use Studios. |
| `free` | External clients and free users. Personal API key. |

### Dimension B — Workspace role (`workspace_members.role`)

| Role | Can do |
|---|---|
| `owner` | All permissions + delete workspace + manage billing |
| `admin` | Manage members, files, docs, chat. Cannot delete workspace. |
| `editor` | Create/edit files, docs, comment, chat |
| `commenter` | View and comment only (no editing) |
| `viewer` | Read-only, no commenting |

## Role hierarchy

```
owner (5) > admin (4) > editor (3) > commenter (2) > viewer (1)
```

The helper function `is_workspace_member(workspace_id, min_role)` in Supabase
encodes this hierarchy. A role "satisfies" a minimum role if its rank ≥ min rank.

## RLS policy matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `workspaces` | member (viewer+) OR platform admin | platform admin or team | workspace admin+ | workspace owner |
| `workspace_members` | member (viewer+) | workspace admin+ | workspace admin+ | workspace admin+ |
| `workspace_invitations` | workspace admin+ | workspace admin+ | workspace admin+ | workspace admin+ |
| `folders` (Phase 2) | member (viewer+) | editor+ | editor+ | editor+ |
| `files` (Phase 2) | member (viewer+) | editor+ | editor+ | editor+ or admin |
| `media_comments` (Phase 3) | member (viewer+) | commenter+ | author | author or admin |
| `documents` (Phase 4) | member (viewer+) | editor+ | editor+ | editor+ or admin |
| `document_comments` (Phase 4) | member (viewer+) | commenter+ | author | author or admin |
| `chat_messages` (Phase 5) | member (viewer+) | commenter+ | author (15 min window) | author or admin |
| `chat_reads` (Phase 5) | own | own | own | — |
| `activity_log` (Phase 5+) | member (viewer+) | trigger only | — | — |
| `notifications` (Phase 3+) | own | trigger only | own | own |

## Typical user assignments

| Person | Platform role | Workspace | Workspace role |
|---|---|---|---|
| Andrés | `admin` | — | — (has superadmin access to all) |
| Andrés on internal project | `admin` | DreamWare Internal | `owner` |
| Hanna | `team` | DreamWare Internal | `admin` |
| Leonor | `team` | Cliente Verant | `editor` |
| Client contact (Verant) | `free` | Cliente Verant | `owner` |
| Client designer (Verant) | `free` | Cliente Verant | `editor` |
| Review-only stakeholder | `free` | Cliente Revisor | `commenter` |

## Key implementation notes

1. **`is_workspace_member(wid, min_role)`** is `SECURITY DEFINER STABLE SET search_path = public` — same pattern as `is_admin()`. Prevents RLS recursion.

2. **Acceptance of invitations** uses `createAdminClient()` (service role) in Server Actions — the invitation token is the authorization proof, not membership.

3. **Platform admins** bypass workspace RLS via the `is_admin() OR is_workspace_member(...)` pattern on workspace SELECT. For mutations, they act as `owner` in `assertWorkspaceRole()`.

4. **Owners cannot be removed** if they are the last owner (enforced in `removeMember` server action).

5. **Slug constraint**: `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$` — 3–50 chars, lowercase alphanumeric + dashes, no leading/trailing dashes.
