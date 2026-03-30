import Trans from "./Trans";

const BraveMeasureTextError = () => {
  return (
    <div data-testid="brave-measure-text-error">
      <p>
        It looks like your browser is blocking some features required for text rendering.
      </p>
      <p>
        Please try disabling strict fingerprinting protection or use a different browser if text elements are not appearing correctly.
      </p>
    </div>
  );
};

export default BraveMeasureTextError;
