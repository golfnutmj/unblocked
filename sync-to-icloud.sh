#!/bin/bash
# Sync kanban board to iCloud Drive for cross-device access

set -e

KANBAN_DIR="/Users/milojr/Projects/kanban-dashboard"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Kanban Board"

echo "📦 Syncing Kanban Board to iCloud Drive..."

# Create iCloud folder if it doesn't exist
mkdir -p "$ICLOUD_DIR"

# Copy kanban files to iCloud
cp "$KANBAN_DIR/index.html" "$ICLOUD_DIR/"
cp "$KANBAN_DIR/style.css" "$ICLOUD_DIR/"
cp "$KANBAN_DIR/script.js" "$ICLOUD_DIR/"

echo "✅ Kanban board synced to iCloud Drive!"
echo "📂 Location: $ICLOUD_DIR"
echo ""
echo "🌐 To access on other devices:"
echo "  1. Open iCloud Drive app/folder"
echo "  2. Navigate to 'Kanban Board'"
echo "  3. Open index.html in Safari/Chrome"
echo ""
echo "💾 Your data auto-saves to browser localStorage on each device"
