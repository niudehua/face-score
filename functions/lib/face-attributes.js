// Face++ requests use "smiling" while the documented response uses "smile".
// Accept compatible providers using either name and normalize missing optional data.
export function faceAttributes(face) {
  const a = face?.attributes;
  if (!a || !['Male', 'Female'].includes(a.gender?.value) ||
      !Number.isFinite(a.age?.value) || !Number.isFinite(a.beauty?.male_score) || !Number.isFinite(a.beauty?.female_score)) return null;
  const number = value => Number.isFinite(value) ? value : 0;
  const object = value => value && typeof value === 'object' ? value : {};
  const numbers = value => Object.fromEntries(Object.entries(object(value)).filter(([, v]) => Number.isFinite(v)));
  const eyes = object(a.eyestatus);
  const gaze = object(a.eyegaze);
  const left = object(gaze.left_eye_gaze), right = object(gaze.right_eye_gaze);
  return {
    ...a,
    smile: { value: number(a.smile?.value ?? a.smiling?.value) },
    headpose: numbers(a.headpose), facequality: numbers(a.facequality),
    skinstatus: numbers(a.skinstatus), emotion: numbers(a.emotion),
    mouthstatus: numbers(a.mouthstatus), ethnicity: object(a.ethnicity),
    blur: { blurness: { value: number(a.blur?.blurness?.value) } },
    eyestatus: { left_eye_status: numbers(eyes.left_eye_status), right_eye_status: numbers(eyes.right_eye_status) },
    eyegaze: {
      left_eye_gaze: { position_x_coordinate: number(left.position_x_coordinate), position_y_coordinate: number(left.position_y_coordinate) },
      right_eye_gaze: { position_x_coordinate: number(right.position_x_coordinate), position_y_coordinate: number(right.position_y_coordinate) }
    }
  };
}
