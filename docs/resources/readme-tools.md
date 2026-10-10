# README tools

Resources imported from [Awesome README Tools](https://github.com/dhyeythumar/awesome-readme-tools) (CC0-1.0, reviewed at commit `4d577fc` on 2026-10-10). Search them with `node tools/resources.mjs search badge --project docs-knowledge` or `genlib find readme badge`.

## How to choose

- **Project READMEs** (libraries, apps, services): start from Genlib's [docs starter](../../templates/docs/README.md) and [README practices](../best-practices/readme-and-docs.md). Add only status badges that carry information: CI (GitHub's native workflow badge), license, version, and coverage when it is real. [Shields](https://github.com/badges/shields) covers most of these.
- **Profile READMEs** (a person or organization page): generators, stats cards and scheduled actions in this list fit here. Self-host stats cards you depend on, because shared public instances are rate-limited.
- **Brand logos**: [Simple Icons](https://github.com/simple-icons/simple-icons) (CC0 icons; the brands remain trademarks).
- **Diagrams**: GitHub renders Mermaid code blocks natively, so you don't need an image service for architecture or flow diagrams.

Each record's license is the upstream project's own, read from its license file on 2026-10-10. That is separate from the list's CC0 license. Records without a license file are marked `license-review`: use the hosted tool, but do not copy its source. Records are checked automatically for links and licenses (`partial`); none are installed or tested in Genlib.

## README generators

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| GitHub profile readme generator allows you to create nice and simple github profile readme files that will be  | [`arturssmirnovs-profile-readme-generator`](https://github.com/arturssmirnovs/github-profile-readme-generator) | reference | MIT |
| AI-powered README generator with live preview and customizable templates for both profile and project readmes | [`coolreadme`](https://coolreadme.xyz) | service | none found |
| CLI tool to generate an esthetic readme file 🔖 | [`get-readme`](https://github.com/luctst/get-readme) | license-review | none found |
| Best Profile Generator, Create your perfect GitHub Profile ReadMe in the best possible way. Lots of features a | [`github-profile-readme-maker`](https://github.com/VishwaGauravIn/github-profile-readme-maker) | reference | GPL-3.0 |
| This tool contains mini GUI components that you can hook together to automatically generate markdown code for  | [`github-profilinator`](https://github.com/rishavanand/github-profilinator) | reference | MIT |
| Beautify your github profile with this amazing tool | [`profile-readme-generator`](https://github.com/maurodesouza/profile-readme-generator) | reference | MIT |
| Generate github profile readme easily with the latest add-ons like visitors count, github stats, etc using min | [`rahuldkjain-profile-readme-generator`](https://github.com/rahuldkjain/github-profile-readme-generator) | reference | Apache-2.0 |
| Multi-language README generator that builds README files from a single `.src.md` template with imports, widget | [`readme-generator`](https://github.com/nanolaba/readme-generator) | reference | Apache-2.0 |
| Stop wasting time on READMEs. This CLI tool generates professional documents for your Git projects with ease | [`readme-manager`](https://gitlab.com/MarleyPlant/readme-manager) | reference | LGPL-3.0 |
| Generate beautiful header images for your github profile readmes | [`reheader`](https://github.com/khalby786/REHeader) | reference | MIT |

## Badges

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| An API serving useful badges for your github profile readme 🚀 | [`git-badges`](https://github.com/puf17640/git-badges) | service | BSD-3-Clause |
| General purpose hits (page views) counter | [`hits`](https://github.com/dwyl/hits) | service | LGPL-3.0 |
| Badges for your profile and projects | [`markdown-badges`](https://github.com/Ileriayo/markdown-badges) | service | MIT |
| Funny badges. Similar to GitHub Achievements, but users can define own badges | [`my-badges`](https://github.com/my-badges/my-badges) | service | MIT |
| Concise, consistent, and legible badges in SVG and raster format | [`shields`](https://github.com/badges/shields) | service | MIT |
| Display your stats with this unique StackOverflow badge | [`stackoverflow-badge`](https://github.com/claytonjhamilton/stackoverflow-badge) | service | CC0-1.0 |
| A badge generator service to count visitors of your markdown file | [`visitor-badge`](https://github.com/jwenjian/visitor-badge) | service | GPL-3.0 |

## GitHub Actions that update READMEs

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Display profile activity and other cool widgets in your profile readme | [`actions-js-profile-readme`](https://github.com/actions-js/profile-readme) | package | MIT |
| Dynamically display your recent github activity (Markdown or HTML) | [`activity-log`](https://github.com/TheDanniCraft/activity-log) | package | MIT |
| Show the latest blog posts from any sources or StackOverflow activity or youtube videos on your github profile | [`blog-post-workflow`](https://github.com/gautamkrishnar/blog-post-workflow) | package | AGPL-3.0 |
| Go CLI + GitHub Action that generates 9 themed SVG profile cards with 61+ themes and byte-weighted commit-to-l | [`ghstats`](https://github.com/tiennm99/ghstats) | package | Apache-2.0 |
| GitHub action to push updates to your special profile repository | [`github-action-dynamic-profile-page`](https://github.com/umutphp/github-action-dynamic-profile-page) | package | GPL-3.0 |
| Updates readme with the recent github activity of a user | [`github-activity-readme`](https://github.com/jamesgeorge007/github-activity-readme) | package | MIT |
| Automatically creates a table in your read me with your most followed followers | [`my-most-followed-followers`](https://github.com/Joe-Huber/my-most-followed-followers) | package | MIT |
| Showcase your github stats on your profile readme | [`profile-readme-stats`](https://github.com/teoxoy/profile-readme-stats) | package | MIT |
| GitHub action helps to add cool dev metrics to your github profile readme | [`waka-readme-stats`](https://github.com/anmol098/waka-readme-stats) | package | MIT |

## Widgets and stats cards

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Showcase Follower History using dynamically generating SVG images | [`gh-follow-tracker`](https://github.com/Bittu5134/GH-Follow-Tracker) | license-review | none found |
| Dynamically generating area charts to showcase relative velocity of work across repos | [`gitclear-area-charts`](https://www.gitclear.com/github_profile_dynamic_readme_free#area_graph) | service | none found |
| Dynamically generating daily visualization of which tickets/repos/branches are being worked on by individual o | [`gitclear-commit-activity`](https://www.gitclear.com/github_profile_dynamic_readme_free#commit_activity) | service | none found |
| Octocat: Generate an image of all your Github contributions | [`github-contributions-chart`](https://github.com/sallar/github-contributions-chart) | service | MIT |
| Generate dynamic SVG tables showcasing your GitHub pull requests with repository statistics and star-based fil | [`github-pr-stats`](https://github.com/f14XuanLv/github-pr-stats) | service | MIT |
| A header image generator for your Github profile Readme | [`github-profile-header-generator`](https://github.com/leviarista/github-profile-header-generator) | service | MIT |
| Add dynamically generated github trophy on your readme | [`github-profile-trophy`](https://github.com/ryo-ma/github-profile-trophy) | service | MIT |
| Dynamically generated images from your LinkedIn profile on your github readmes | [`github-readme-linkedin`](https://github.com/soroushchehresa/github-readme-linkedin) | license-review | none found |
| Dynamically generated your latest Medium article on your github readmes | [`github-readme-medium`](https://github.com/omidnikrah/github-readme-medium) | license-review | none found |
| Dynamically generated statistics of your Packagist Bundles for your GitHub readme | [`github-readme-packagist-stats`](https://github.com/agonyz/github-readme-packagist-stats) | service | MIT |
| Add programming quotes to your github readme | [`github-readme-quotes`](https://github.com/PiyushSuthar/github-readme-quotes) | service | MIT |
| Dynamically generated your StackOverflow status on your github readmes | [`github-readme-stackoverflow`](https://github.com/omidnikrah/github-readme-stackoverflow) | license-review | none found |
| Dynamically generated stats for your github readmes | [`github-readme-stats`](https://github.com/anuraghazra/github-readme-stats) | service | MIT |
| Display your total contributions, current streak, and longest streak on your github profile readme | [`github-readme-streak-stats`](https://github.com/DenverCoder1/github-readme-streak-stats) | service | MIT |
| Add Twitter to your github readmes | [`github-readme-twitter`](https://github.com/gazf/github-readme-twitter) | service | MIT |
| Generate Stats as like Terminal Interface with typing effects dynamically for your profile Readme | [`github-stats-terminal-style`](https://github.com/yogeshwaran01/github-stats-terminal-style) | service | MIT |
| Generate beautiful 3D isometric visualizations of GitHub contribution graphs with customizable themes, live pr | [`isometric-contributions`](https://github.com/Spectrewolf8/isometric-contributions) | service | MIT |
| Generate custom profile activity for your profile readme | [`profile-activity-generator`](https://github.com/omidnikrah/profile-activity-generator) | license-review | none found |
| Returns random meme images scraped from Memedroid | [`random-memer`](https://github.com/techytushar/random-memer) | license-review | none found |
| Jokes for your github readmes | [`readme-jokes`](https://github.com/ABSphreak/readme-jokes) | service | MIT |
| Google lighthouse stats of your website that you can put in readme | [`readme-pagespeed-insights`](https://github.com/ankurparihar/readme-pagespeed-insights) | service | Apache-2.0 |
| SVG icons for popular brands | [`simple-icons`](https://github.com/simple-icons/simple-icons) | package | CC0-1.0 |
| Show your Spotify playing on your github profile | [`spotify-github-profile`](https://github.com/kittinan/spotify-github-profile) | service | MIT |
| A modern and customizable widget for showing your current Spotify song on your github profile | [`spotify-readme`](https://github.com/tthn0/Spotify-Readme) | service | GPL-3.0 |
| Display your recently played Spotify tracks on your GitHub profile README | [`spotify-recently-played-readme`](https://github.com/JeffreyCA/spotify-recently-played-readme) | service | MIT |
| Showcase your Telegram presence with beautiful, dynamic preview cards | [`telegram-card`](https://github.com/Malith-Rukshan/telegram-card) | service | MIT |
| Generate terminal-style SVG identity cards for your github profile readme with live stats, 4 provider shells,  | [`terminal-identity`](https://github.com/doyoon530/terminal-identity) | service | MIT |
| Wakatime weekly metrics on your profile readme | [`waka-readme`](https://github.com/athul/waka-readme) | service | MIT |
| Dynamic YouTube stats card for your github readmes | [`youtube-stats-card`](https://github.com/Dhyeythumar/youtube-stats-card) | service | MIT |
