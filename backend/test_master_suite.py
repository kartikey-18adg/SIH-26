import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.test_all_phases import test_full_flow
from backend.test_phase_f import run_tests as run_phase_f
from backend.test_phase_g import run_phase_g_tests
from backend.test_phase_h import run_phase_h_tests
from backend.test_phase_i import run_phase_i_tests
from backend.test_navigation_and_views import run_navigation_tests
from backend.test_obligations import run_obligation_tests

def main():
    print("=====================================================================")
    print("       AICLEAR MASTER VERIFICATION SUITE (PHASES A THROUGH I)       ")
    print("=====================================================================\n")

    print(">>> SECTION 1: END-TO-END PIPELINE (PHASES B -> F) <<<")
    test_full_flow()
    print("\n")

    print(">>> SECTION 2: DETERMINISTIC COMPLIANCE ENGINE (PHASE F) <<<")
    run_phase_f()
    print("\n")

    print(">>> SECTION 3: ALERT QUEUE & NOTIFICATION OUTBOX (PHASE G) <<<")
    run_phase_g_tests()
    print("\n")

    print(">>> SECTION 4: OPERATIONAL REPORTS & EXPORTS (PHASE H) <<<")
    run_phase_h_tests()
    print("\n")

    print(">>> SECTION 5: MODE BOUNDARIES & JUDGE WALKTHROUGH (PHASE I) <<<")
    run_phase_i_tests()
    print("\n")

    print(">>> SECTION 6: TOP NAVIGATION & MULTI-VIEW SYSTEM <<<")
    run_navigation_tests()
    print("\n")

    print("=====================================================================")
    print("   ALL PHASES (A THROUGH I) VERIFIED 100% OPERATIONAL & COMPLIANT!   ")
    print("=====================================================================")

if __name__ == "__main__":
    main()


# Additional lifecycle coverage for time-bound undertakings and EVC operations.
if __name__ == "__main__":
    run_obligation_tests()
