import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Spinner } from "@workspace/ui/components/spinner";

/** Shown while the API fetches Rate My Professors ratings for the first time. */
export function RatingsSyncingAlert() {
  return (
    <Alert variant="info">
      <Spinner aria-hidden />
      <AlertTitle>Loading Rate My Professors ratings</AlertTitle>
      <AlertDescription>
        Ratings are being fetched for the first time, which can take about a
        minute. They'll fill in on their own.
      </AlertDescription>
    </Alert>
  );
}
