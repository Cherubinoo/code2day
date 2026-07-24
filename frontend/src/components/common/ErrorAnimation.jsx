import '@lottiefiles/dotlottie-wc';

// Shared by the 404 page and the offline/network-error overlay — same
// animation, since both are "something's wrong reaching this" moments.
export default function ErrorAnimation({ size = 220 }) {
  return (
    <dotlottie-wc
      src="https://lottie.host/83c4ed08-305a-42d4-9641-6560635fc7e0/Dcy6gt2rNa.lottie"
      autoplay
      loop
      style={{ width: size, height: size }}
    />
  );
}
