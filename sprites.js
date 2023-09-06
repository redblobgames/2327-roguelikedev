/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 */
'use strict';

async function S(icon) {
    // This relies on the way game-icons.net svgs are structured,
    // as a single <path d="…"/>
    const url = `./game-icons/${icon}.svg`;
    const stream = await fetch(url);
    const svg = await stream.text();
    return new Path2D(svg.replace(/.* d="/, "").replace(/".*/, ""));
}

export default {
    person:       await S("delapouite/person"),
    rooster:      await S("delapouite/rooster"),
    grass:        await S("delapouite/grass"),
    wheat:        await S("lorc/wheat"),
    rawfood:      await S("delapouite/grain-bundle"),
    wall:         await S("delapouite/stone-wall"),
    door:         await S("delapouite/door"),
    move:         await S("delapouite/move"),
    square:       await S("delapouite/square"),
    sprout:       await S("lorc/sprout"),
    table:        await S("delapouite/table"),
    desk:         await S("delapouite/desk"),
    bed:          await S("delapouite/bed"),
    digdug:       await S("lorc/dig-dug"),
    mining:       await S("lorc/mining"),
    anvil_impact: await S("lorc/anvil-impact"),
    hand_saw:     await S("delapouite/hand-saw"),
    fishing_pole: await S("delapouite/fishing-pole"),
    watering_can: await S("delapouite/watering-can"),
    footprint:    await S("lorc/footprint"),
    stop_sign:    await S("delapouite/stop-sign"),
    check_mark:   await S("delapouite/check-mark"),
    cooking_pot:  await S("delapouite/camp-cooking-pot"),
    meal:         await S("delapouite/hot-meal"),
};



