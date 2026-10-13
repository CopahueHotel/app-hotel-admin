#!/bin/bash
set -euo pipefail
umask 077
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
apt-get update -qq
apt-get install -y --no-install-recommends restic
install -d -m 700 /etc/hotel-backup /var/backups/hotel-admin-automatic
install -m 700 /tmp/hotel-backup-install/hotel_backup.py /usr/local/sbin/hotel-backup
install -m 644 /tmp/hotel-backup-install/hotel-backup.service /tmp/hotel-backup-install/hotel-backup.timer /tmp/hotel-backup-install/hotel-backup-restore-test.service /tmp/hotel-backup-install/hotel-backup-restore-test.timer /etc/systemd/system/
systemd-analyze calendar '*-*-* 03,09,15,21:00:00 America/Argentina/Buenos_Aires'
systemctl daemon-reload
/usr/local/sbin/hotel-backup init
systemctl start hotel-backup.service
/usr/local/sbin/hotel-backup restore-test
systemctl enable --now hotel-backup.timer hotel-backup-restore-test.timer
systemctl is-active hotel-admin hotel-pruebas nginx
systemctl list-timers hotel-backup.timer hotel-backup-restore-test.timer --no-pager
