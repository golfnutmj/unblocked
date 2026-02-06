# 🚀 Deploy Unblocked to GitHub Pages

Get a permanent shareable URL like: `https://yourusername.github.io/unblocked`

---

## Prerequisites

- [ ] GitHub account
- [ ] Git installed on Mac (already have it)
- [ ] Unblocked code at `/Users/milojr/Projects/kanban-dashboard/`

---

## Step 1: Create GitHub Repository

### Option A: Via GitHub Website (Easier)

1. Go to https://github.com/new
2. Repository name: **`unblocked`**
3. Description: **"Beautiful real-time kanban board with Firebase sync"**
4. Visibility: **Private** (for now - can change later)
5. Do NOT initialize with README
6. Click **"Create repository"**

### Option B: Via GitHub CLI (Faster)

```bash
cd /Users/milojr/Projects/kanban-dashboard
gh repo create unblocked --private --source=. --remote=origin --push
```

---

## Step 2: Push Your Code to GitHub

```bash
cd /Users/milojr/Projects/kanban-dashboard

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Unblocked v1.0 with Firebase sync"

# Link to GitHub (replace YOUR-USERNAME)
git remote add origin https://github.com/YOUR-USERNAME/unblocked.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 3: Enable GitHub Pages

### Via GitHub Website

1. Go to your repo: `https://github.com/YOUR-USERNAME/unblocked`
2. Click **Settings** (top right)
3. Scroll to **Pages** (left sidebar)
4. Under "Build and deployment":
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Click **Save**

### Via GitHub CLI

```bash
gh repo edit --enable-pages --pages-branch main --pages-path /
```

---

## Step 4: Wait for Deployment

GitHub will build and deploy automatically.

**Check status:**
```bash
gh run list
```

**Or visit:** `https://github.com/YOUR-USERNAME/unblocked/actions`

**Usually takes:** 1-3 minutes

---

## Step 5: Get Your URL!

Once deployed, your URL will be:

```
https://YOUR-USERNAME.github.io/unblocked
```

**Test it:**
1. Open the URL in your browser
2. Create a test card
3. Open the URL on your iPhone
4. Watch it sync! ✨

---

## Step 6: Add to iPhone Home Screen (Again)

Same process as local setup, but now with GitHub URL:

1. On iPhone, open Safari
2. Go to `https://YOUR-USERNAME.github.io/unblocked`
3. Tap **Share** button
4. **"Add to Home Screen"**
5. Name it **"Unblocked"**
6. Tap **"Add"**

Now it works from anywhere, even when your Mac is off!

---

## Sharing with Others

### Option 1: Keep Repo Private, Share URL

**Current setup:**
- Repo is private (code hidden)
- URL works for anyone with the link
- They can use the app
- They can't see the code or Firebase config

**To share:**
- Just send them the URL
- That's it!

### Option 2: Make Repo Public (Later)

When you're ready to open-source:

```bash
gh repo edit --visibility public
```

**Benefits:**
- Others can see code
- Others can contribute
- Builds trust/credibility

**Downside:**
- Firebase config is visible (you'll want auth first)

---

## Updating the App

Every time you make changes:

```bash
cd /Users/milojr/Projects/kanban-dashboard

# Make your changes to code

# Commit and push
git add .
git commit -m "Add new feature: X"
git push

# GitHub Pages auto-updates in 1-3 min!
```

---

## Custom Domain (Optional)

Want `unblocked.mjprojects.com` instead of `github.io`?

### Quick Steps:

1. **Buy domain** (Namecheap, Google Domains, etc.)
2. **Add CNAME record:**
   ```
   CNAME: unblocked -> YOUR-USERNAME.github.io
   ```
3. **GitHub Settings > Pages > Custom domain:**
   - Enter: `unblocked.mjprojects.com`
   - Click Save
4. **Enable HTTPS** (automatic after DNS propagates)

**Cost:** ~$12/year for domain

---

## Security Note

⚠️ **Current Setup (Test Mode):**
- Firebase is in test mode (anyone can read/write)
- Fine for personal use + small group
- URL is "secret" (not indexed by Google if repo is private)

🔒 **Later (Phase 2):**
- Add Firebase Authentication
- Users log in with Google/email
- Each user sees only their boards
- Ready for public launch

---

## Troubleshooting

### "404 - File not found"

**Fix:** Make sure `index.html` is in the root directory, not a subfolder.

```bash
ls /Users/milojr/Projects/kanban-dashboard/
# Should show: index.html, style.css, script.js
```

### "Cards not syncing"

**Fix:** Check Firebase config in `script.js` - should be your Firebase project ID.

### "GitHub Pages not showing up"

**Wait:** Can take up to 10 minutes for first deployment  
**Check:** `https://github.com/YOUR-USERNAME/unblocked/deployments`

---

## Cost

**GitHub Pages:** FREE (unlimited for public repos, 1GB for private)  
**Firebase:** FREE (within limits - you're way under)  
**Domain (optional):** ~$12/year  

**Total:** $0-12/year depending on domain choice

---

## Next Steps

After deployment:

1. ✅ Test on multiple devices
2. ✅ Share with a couple of people
3. ⏭️ Gather feedback
4. ⏭️ Add requested features
5. ⏭️ Phase 2: Add authentication for wider sharing

---

**Ready to deploy? Let me know if you need help with any step!** 🚀
