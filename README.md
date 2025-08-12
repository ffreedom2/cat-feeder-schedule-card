# Cat Feeder Schedule Card (Aqara ZNCWWSQ01LM)

A Lovelace custom card for Home Assistant + Zigbee2MQTT to edit and publish the feeder schedule and run manual feedings. Includes a GUI config editor. Built with Lit + TypeScript.

## Install (HACS, custom repo)
1. Build: `npm i && npm run build`
2. In Home Assistant → HACS → Custom repositories → Add this repo as **Lovelace**.
3. Install the card, then add a resource pointing to `/hacsfiles/cat-feeder-schedule-card/cat-feeder-schedule-card.js`.
4. Add the card in the dashboard and configure via the GUI.

## Direct (no HACS)
1. Build: `npm i && npm run build`
2. Copy `dist/cat-feeder-schedule-card.js` to `<config>/www/cat-feeder-schedule-card.js`.
3. Add a resource: `/local/cat-feeder-schedule-card.js` (JavaScript Module).

## Config fields
- **mqtt_topic** (required): Zigbee2MQTT set topic, e.g. `zigbee2mqtt/feeder/set`
- **schedule_key**: JSON key that device expects for the schedule (default `schedule`)
- **schedule_entity**: optional entity with current JSON / attributes (`serving_size`, `portion_weight`, maybe `error`)
- **status_entity**: optional boolean/binary sensor for error flag
- **default_size**, **serving_size**, **portion_weight**
- **manual_command_key**: key for manual feed (default `feed`)

## Payload
Schedule rows map to:
```json
{ "schedule": [ { "days": "workdays", "hour": 8, "minute": 0, "size": 2 } ] }
```
Optionally include `serving_size` and `portion_weight`.


## HACS compliance notes
HACS expects the built JS at the **repository root** or as a release asset matching `hacs.json.filename`.
This repo ships a workflow that, on tag `v*.*.*`, builds and copies `dist/cat-feeder-schedule-card.js` to the root as `cat-feeder-schedule-card.js` and attaches it to the GitHub release.

If building locally for a release:
```bash
npm run build:release
git add cat-feeder-schedule-card.js
git commit -m "chore: include built file for HACS"
git tag v0.1.1
git push --tags
```
