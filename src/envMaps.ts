import type { EnvMapOption } from './types';

const NONE_THUMBNAIL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkBAMAAACCzIhnAAAALVBMVEUAAABQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFD0f7CQAAAADnRSTlMAEM/vcN8gkIA8n69gv9AeqN0AAAGeSURBVFjD7ZW7SgNBFIbPelmDiCxJL6ayEIIBCxuDYmUTrERUZBt78QFCQCxsrCysxMbSIIKt2Nja2IvmQkxivmcwE8Lu6c4+wHzVDuw/35kLZ8Tj8Xg8HsfNS6W1eiXZCS4YcxiPvh/jLIkaE/qx5HkSmx0SjoMS93ZiDsU5zcgu6wvY3I2Cm1ccRVsyBWyMZw4vwUlMatCd/BY2oGsnFoAtmVAYDyxO4S9ZVgkom5GGmjdPB7uyEPpKUqyBtf552E8lzagAdSMyC3UlkRysGZE7iJVEggo9I3LNQEtEvmgbkVfaWiJSZWBESvS0xFXaMSIVfpRkxBItIwLfqcSxCHYklaQRo7BUkq2wE3pa4pbftDdZSTJtcpWhlrg5fs0L04q0JMS8MNNQ15Ic7BmRHJSVRE4x+1gAXSWRBsR2g+EklcxAXywKoCQfsG9GZoCyHrxlan39OHkCjAaT9q6DOHlmlu1IHsfAtfFPYBhlkaygOMsiaUbvJKyLTZWia/gTupHYfLgzCR+A5JmxWNgWx+1zpXW0Kx6Px+PxjPgHBlQp+dv2kycAAAAASUVORK5CYII=';

// Available environment maps, sourced live from the Poly Haven API. 'none' disables the effect.
export const ENV_MAPS: EnvMapOption[] = [
    { label: 'None', slug: '', thumbnail: NONE_THUMBNAIL },
    {
        label: 'Theater',
        slug: 'theater_01',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/theater_01.png?height=100',
    },
    {
        label: 'Syfer Fontein',
        slug: 'syferfontein_1d_clear_puresky',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/syferfontein_1d_clear_puresky.png?height=100',
    },
    {
        label: 'The Sky Is On Fire',
        slug: 'the_sky_is_on_fire',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/the_sky_is_on_fire.png?height=100',
    },
    {
        label: 'Warm Bar',
        slug: 'warm_bar',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/warm_bar.png?height=100',
    },
    {
        label: 'Whipple Creek Regional Park',
        slug: 'whipple_creek_regional_park_04',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/whipple_creek_regional_park_04.png?height=100',
    },
    {
        label: 'Wooden Studio',
        slug: 'wooden_studio_10',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/wooden_studio_10.png?height=100',
    },
    {
        label: 'Wrestling Gym',
        slug: 'wrestling_gym',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/wrestling_gym.png?height=100',
    },
    {
        label: 'Golden Bay',
        slug: 'golden_bay',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/golden_bay.png?height=100',
    },
];
