#!/system/bin/sh

mkdir -p /dev/mount_masks
chmod 0755 /dev/mount_masks
chcon u:object_r:tmpfs:s0 /dev/mount_masks 2>/dev/null
