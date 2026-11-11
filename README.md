# Touché Regulars

The members' corner of Touché Cafe: a phone-first site for regulars, plus a staff page for stamping cards and seeing who your members are. Plain files, no build step, free to host on GitHub Pages.

- **Members' site:** `index.html` (your Pages address)
- **Staff page:** `staff.html` (your Pages address + `staff.html`)

## 1. Put it on GitHub (about 10 minutes)

1. On github.com click **New repository**. Name it `regulars`, set it to **Public**, and create it.
2. On the new repository page click **uploading an existing file**. Drag in every file from this folder (not the folder itself) and click **Commit changes**.
3. Open **Settings > Pages**. Under "Build and deployment" choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the page shows your address: `https://YOUR-USERNAME.github.io/regulars/`.

To change anything later, open the file on GitHub, click the pencil, edit, and commit. The site updates in about a minute.

## 2. Turn on sign-in and the member database (about 15 minutes)

Until this step is done, the site runs in "this device" mode: no accounts, each patron's journal stays on their own phone, and the staff page is switched off.

1. Create a free account and a new project at supabase.com. Pick the region closest to the Philippines (Singapore).
2. Open **SQL Editor > New query**, paste in everything from `supabase-setup.sql`, and press **Run**.
3. On the last line of that file, change `you@example.com` to your own email and run that line again. Repeat with each barista's email. These are the people allowed into the staff page.
4. Open **Authentication > URL Configuration**. Set **Site URL** to your Pages address. Under **Redirect URLs** add both your Pages address and your Pages address + `staff.html`.
5. Open **Project Settings > API**. Copy the **Project URL** and the **anon public** key into `config.js` on GitHub, between the quotes, and commit.

After that, anyone can join or come back by entering their email. They get a link, tap it, and they are in. There are no passwords.

The anon key is designed to be public. The setup file locks the database so a patron can only read and change their own profile, and only staff can add stamps or see the member list.

**Before a real launch:** Supabase's built-in email sender only allows a few emails per hour, which is fine for testing but not for a launch day. Connect an email service (Resend and Brevo both have free plans) under **Authentication > SMTP Settings**.

## 3. Using the staff page

Open your Pages address + `staff.html` on the counter phone or tablet and sign in with a staff email.

- **Stamp a card:** tap **Scan their card** and point the camera at the member's QR code, or type their six-character member code. Their profile appears with every stamp; tap one to add it, tap again to undo.
- **Members:** every member with their name, email, usual, join date, stamp count, and whether they asked for a first sip or entered the draw. Search it, open anyone to stamp them, or download the whole list as a spreadsheet file.

You can also see and edit all of this directly in Supabase under **Table Editor**.

Once sign-in is on, patrons can no longer stamp their own journal. Only staff can.

## Updating what patrons see

Open `content.js`. Each section has a comment saying where it appears. Change the text between the quotes. Anything in `[BRACKETS]` is a blank waiting for you.

- Keep the quotes and commas exactly where they are.
- Never change a stamp's `id` after launch. Change its `label` instead.

## Matching the brand

Open `styles.css`. The first block lists the colors and fonts with a note on each. Replace the hex codes with Touché's own. To change a Pugo pose, replace its image with a new one saved under the same file name (a transparent background works best on the dark pages).

## What's in the folder

| File | What it is |
|---|---|
| `index.html`, `app.js` | The members' site |
| `staff.html`, `staff.js` | The staff page |
| `content.js` | Every word patrons read |
| `styles.css` | Colors and fonts |
| `config.js` | The two sign-in values |
| `supabase-setup.sql` | One-time database setup |
| `pugo-*.png` | Pugo's poses and the site icon |
| `manifest.webmanifest` | Lets patrons add the site to their home screen |

## Before you launch

- Fill in every `[BRACKET]` in `content.js`.
- Read the privacy line at the bottom of `content.js`. You are collecting names and emails, so it should say what you keep and why.
- Check whether your members' draw needs a DTI permit before announcing it.
- Do one full test: join with your own email, open the staff page, stamp yourself, and confirm the stamp shows in your journal.
