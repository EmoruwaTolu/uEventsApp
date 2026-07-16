# uEvents — App Store Connect listing

Ready-to-paste copy for App Store Connect + TestFlight. Character limits are noted in
brackets; everything below is within them. Bilingual (English + French/Canada) since the
audience is uOttawa.

---

## 0. Quick reference

| Field | Value |
|---|---|
| App name [30] | `uEvents` |
| Bundle ID | `com.cssa.uevents` |
| Primary category | Education *(or Social Networking)* |
| Secondary category | Social Networking |
| Privacy Policy URL | `https://ueventsapp.onrender.com/legal/privacy` |
| Terms of Use (EULA) URL | `https://ueventsapp.onrender.com/legal/terms` |
| Support URL | `https://ueventsapp.onrender.com/legal/support` |
| Support email | `support.uevents@gmail.com` |
| Marketing URL *(optional)* | leave blank for now |
| Age rating | likely **12+** (user-generated content, moderated) — confirm via the questionnaire |
| Export compliance | already answered in `app.json` (`ITSAppUsesNonExemptEncryption: false`) |

---

## 1. English (primary)

### Subtitle [30]
`Campus events, clubs & RSVPs`

### Promotional text [170]  *(editable anytime, no review)*
`New this term: a personalized For You feed, free-food alerts, event recaps with photos, and live polls from your clubs. Never miss what's happening on campus.`

### Keywords [100]  *(comma-separated, no spaces)*
`uottawa,campus,events,clubs,student,university,rsvp,gee gees,societies,calendar,free food,ottawa`

### Description [4000]
```
uEvents is the home for everything happening on campus. Discover events from student
clubs and societies, RSVP in a tap, and get a reminder before every one — all in a feed
that learns what you care about.

DISCOVER WHAT'S ON
• A personalized "For You" feed that surfaces events matching the clubs and topics you follow
• Browse by Today, This Week, or This Month
• Filter by category — academic, social, sports, arts, tech, wellness and more
• Free-food alerts so you never miss a free meal on campus

NEVER MISS AN EVENT
• RSVP in one tap and see who else is going
• Get reminders and add events straight to your device calendar
• Join the waitlist automatically when something fills up
• Check in at events and build an attendance streak

FOLLOW YOUR CLUBS
• Follow the clubs and interests that matter to you
• Announcements, updates, and live polls from clubs you follow
• Like, comment, and vote — right in the feed

RELIVE THE MOMENT
• Post-event recaps with photos from the people who were there
• Rate events and add your own photos to the recap

FOR CLUBS
• Post events, announcements, and polls in minutes
• Schedule posts, manage RSVPs and waitlists, and run check-in
• See who's coming and get analytics on your reach

Built for the University of Ottawa community. Available in English and French.

uEvents is ad-free — we don't sell your data or let advertisers target you.
```

---

## 2. French — Canada (fr-CA)  *(add as a localization in App Store Connect)*

### Subtitle [30]
`Événements, clubs et inscriptions`  *(31 chars — trim to `Événements et clubs du campus`)*

### Promotional text [170]
`Nouveau cette session : un fil « Pour vous » personnalisé, des alertes de nourriture gratuite, des récaps avec photos et des sondages en direct de vos clubs.`

### Keywords [100]
`uottawa,campus,événements,clubs,étudiant,université,inscription,gee gees,calendrier,nourriture,ottawa`

### Description [4000]
```
uEvents rassemble tout ce qui se passe sur le campus. Découvrez les événements des clubs
étudiants, inscrivez-vous en un geste et recevez un rappel avant chacun — le tout dans un
fil qui apprend ce qui vous intéresse.

DÉCOUVRIR
• Un fil « Pour vous » personnalisé selon les clubs et sujets que vous suivez
• Parcourez par Aujourd'hui, Cette semaine ou Ce mois-ci
• Filtrez par catégorie : académique, social, sports, arts, techno, bien-être et plus
• Alertes de nourriture gratuite pour ne jamais manquer un repas gratuit

NE RIEN MANQUER
• Inscrivez-vous en un geste et voyez qui y va
• Recevez des rappels et ajoutez les événements à votre calendrier
• Liste d'attente automatique quand c'est complet
• Enregistrez-vous aux événements et bâtissez une séquence de présence

SUIVRE VOS CLUBS
• Suivez les clubs et les intérêts qui comptent pour vous
• Annonces, mises à jour et sondages en direct des clubs suivis
• Aimez, commentez et votez, directement dans le fil

REVIVRE LES MOMENTS
• Récaps après l'événement avec les photos des participants
• Notez les événements et ajoutez vos propres photos

POUR LES CLUBS
• Publiez événements, annonces et sondages en quelques minutes
• Planifiez, gérez les inscriptions et la liste d'attente, faites l'enregistrement
• Voyez qui vient et consultez vos statistiques

Conçu pour la communauté de l'Université d'Ottawa. Disponible en français et en anglais.

uEvents est sans publicité — nous ne vendons pas vos données.
```

---

## 3. TestFlight — Beta App Information

### Beta App Description
```
uEvents is a University of Ottawa student-events app. Testers can sign up, follow clubs
and topics, browse and RSVP to events, comment and vote on posts, check in at events, and
view event recaps. Club testers can also create events/announcements/polls and view
analytics. Feedback on discovery, RSVP flow, and anything confusing is most helpful.
```

### Feedback email
`support.uevents@gmail.com`

### "What to Test" (test notes for this build) [4000]
```
Thanks for testing uEvents! First launch may take ~30–60s if the server was idle — that's
normal on the free tier.

Please try:
1. Sign up with your email, then set your name, program, and year.
2. Follow a few clubs and a couple of interests (e.g. Tech, Wellness).
3. Browse the Home feed — check "Following" and "For You". Do the recommendations feel right?
4. Open the Discover tab: switch Today / This Week / This Month, tap a day, filter by category.
5. RSVP to an event, add it to your calendar, then cancel the RSVP.
6. Open an event and a post: like, comment, and (on a poll) vote.
7. Try a past-event recap — add a photo and rate it.
8. Switch the app to French in Settings and look around — flag anything still in English.
9. If you have a club account: create an event, schedule a post, and open Analytics.

Known: the very first request after idle is slow; push notifications only work in this
build (not Expo Go). Report anything broken, confusing, or wrong via TestFlight's
screenshot feedback. Thank you!
```

---

## 4. App Privacy (nutrition label) — answers guide

When filling **App Privacy** in App Store Connect, based on what the app collects:

- **Contact Info → Email Address** — Yes. Used for App Functionality + Account. Linked to identity. Not used for tracking.
- **User Content → Photos, Other User Content (comments, posts)** — Yes. App Functionality. Linked to identity.
- **Identifiers → User ID** — Yes. App Functionality. Linked to identity.
- **Usage Data → Product Interaction** — Yes (drives the For You feed). App Functionality + Personalization. Linked to identity.
- **Name, Program/Year** (optional profile) — Contact Info / other. App Functionality. Linked.
- **Tracking:** No — you do not track users across other companies' apps/sites, and there are no ads.

Permissions strings are already in `app.json` (camera, photos, calendar) and shown at the
point of use.

---

## Notes
- Screenshots are still required (6.7" and 6.5" iPhone at minimum). Capture: Home/For You feed,
  Discover, an event detail with RSVP, a club profile, and a recap.
- The two category choices and age rating come from questionnaires — the values above are
  recommendations, not guaranteed outputs.
- This copy is a strong starting point; give it a quick read for anything you'd phrase
  differently in your own voice before submitting.
```
