# Slot production operations

Production is self-hosted. The app joins the external Supabase Docker stack; Caddy/Supabase configuration is not provisioned by app-compose. `vercel.json` has no scheduler.

- Cron wrappers: install `slot-cron-job`, `slot-backup`, `slot-health` root-owned mode 0700 under `/usr/local/sbin`.
- Keep the curl Authorization header in `/etc/slot/cron-curl.conf` (root-only 0600), not process arguments or public documentation. Generate it securely from the deployed CRON_SECRET. Do not print it.
- Preserve the existing renewal/reminder schedules unless a change is agreed. Use flock to prevent overlap on this host. These routes do not guarantee distributed exactly-once execution.
- `slot-cron-job renew --check-config` validates the presence of the protected config without charging. Do not use a live renewal request as a health probe.
- Failed reminders remain unmarked. Operator-controlled retries may be performed the same business day, after checking ambiguous delivery; external delivery and DB acknowledgement cannot be atomic.
- `/api/health` checks database reachability and configured Redis, returns 503 on failures, and includes the APP_VERSION Git commit. It does not check AI, payment, SMTP, or actual delivery.
- `slot-backup` makes a protected daily database archive plus app configuration. It validates archive readability, NOT a full restore. Backups on the same VPS are not disaster recovery; configure encrypted off-server storage and retention separately. Supabase role/config/Storage recovery also needs its own inventory.
- Before deployment: save database/config snapshots and tag the old image for rollback; run tests/typecheck. After deployment check the commit and dependencies. The deployment may briefly restart the app.
- Test restores must use a separate, network-isolated PostgreSQL container, compatible extensions, and explicitly recreated roles without passwords. Do not mount production data volumes. Keep copied personal data protected and remove the test container after verification.
- `restore-db.sh` is only a legacy split-SQL migration helper. It requires RESTORE_CONTAINER, RESTORE_DATABASE and CONFIRM_ISOLATED_RESTORE=yes, refuses the live `supabase-db`, stops at errors, and must not be used as an automatic production restore. The preferred backup is a pg_dump custom archive restored with pg_restore --exit-on-error in a separately prepared target.
- Never run `docker compose down -v` for routine maintenance. Never rotate active VAPID/bot/provider keys without a migration plan.

Tested Supabase recovery also needs role attributes/memberships (without copying login passwords), pg_net/pg_stat_statements/supabase_vault preloads, and the extension-owned graphql_public.graphql helper before ACL replay. Restore pre-data/data/post-data with --no-privileges, then replay all ACL/default-ACL TOC entries after helper rehydration. Keep these metadata files with every backup. Install restore-role-metadata.sql at /usr/local/lib/slot/restore-role-metadata.sql for the backup script. This is database-level recovery, not a complete API/Auth/Storage disaster-recovery exercise.
