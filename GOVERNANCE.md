# Governance

## Who decides

Prayer Wall has one maintainer for now.

| Role | Person | What they may do |
| --- | --- | --- |
| Maintainer | [@RomaVega](https://github.com/RomaVega) | Final say on scope, decisions and releases; handles legal notices and requests from authorities |
| Deputy | [@andreiyurik](https://github.com/andreiyurik) | Acts when the maintainer cannot be reached for 24 hours, including changing the operating mode |

Decisions are made in the open, in issues and pull requests. A change to a decision in
`docs/blueprint.md` is recorded in `docs/decisions.md` with the date and the reason.

## How this can widen

When there are regular contributors, the maintainer may invite them as co-maintainers.
With three or more maintainers, decisions are made by agreement, and by simple majority when
agreement cannot be reached. This file is updated when that happens.

## Moderators

Moderators are volunteers who review held and reported requests. They judge conduct against the
seven public rules, never theology. They do not contact or reply to authors.
The moderator guide is `docs/moderator-guide.md`.

## Surviving the loss of one person

The project must not depend on any single person or payment card.

| Item | Rule | Status |
| --- | --- | --- |
| Repository | Owned by the `Pray-Wall` GitHub organisation, with two owners | Organisation created 17 Nov 2026; second owner invited |
| Cloudflare account | Has a second administrator | To do before launch |
| Domain | Registered for the longest available term with automatic renewal; the deputy can reach the registrar account | To do when the domain is chosen (M7) |
| Payment method | Has a backup | To do before moving to the paid plan |
| Recovery | The 30-minute procedure in `docs/runbook.md` is rehearsed once before launch | To do (M7) |

Because every request expires within 30 or 60 days, the service holds almost nothing worth
restoring. Recovery is: deploy the code, create an empty database, set the secrets.
