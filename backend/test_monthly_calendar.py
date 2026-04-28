#!/usr/bin/env python3
"""
Test script to verify the monthly calendar generation logic
"""
from datetime import datetime, timedelta

def build_activity_calendar_test():
    """
    Build a monthly activity calendar for the current month.
    Returns activity data for the entire current month plus padding days
    to fill the calendar grid (previous/next month days).
    """
    today = datetime.now().date()
    
    # Get the first and last day of the current month
    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
    
    # Calculate padding days to fill the calendar grid
    # Start from the Sunday before the first day of the month
    start_weekday = month_start.weekday()  # Monday=0, Sunday=6
    # Adjust to make Sunday=0
    start_offset = (start_weekday + 1) % 7
    calendar_start = month_start - timedelta(days=start_offset)
    
    # End on the Saturday after the last day of the month
    end_weekday = month_end.weekday()  # Monday=0, Sunday=6
    # Calculate days to add to reach Saturday (weekday=5)
    # If month ends on Saturday (5), add 0 days
    # If month ends on Sunday (6), add 6 days
    # If month ends on Monday (0), add 5 days, etc.
    end_offset = (5 - end_weekday) % 7
    calendar_end = month_end + timedelta(days=end_offset)
    
    # Build the calendar array
    calendar = []
    current_day = calendar_start
    while current_day <= calendar_end:
        count = 0  # No activity for test
        calendar.append(
            {
                "date": current_day.isoformat(),
                "count": count,
                "weekday": current_day.strftime("%a"),
                "day": current_day.day,
            }
        )
        current_day += timedelta(days=1)
    
    return calendar

if __name__ == "__main__":
    calendar = build_activity_calendar_test()
    
    print(f"✅ Monthly Calendar Generated Successfully!")
    print(f"📅 Total days in calendar: {len(calendar)}")
    print(f"📆 First date: {calendar[0]['date']} ({calendar[0]['weekday']})")
    print(f"📆 Last date: {calendar[-1]['date']} ({calendar[-1]['weekday']})")
    print(f"\n🗓️  Calendar should start on Sunday and end on Saturday")
    print(f"   First day is: {calendar[0]['weekday']}")
    print(f"   Last day is: {calendar[-1]['weekday']}")
    
    # Verify it's a valid calendar grid (multiple of 7)
    if len(calendar) % 7 == 0:
        print(f"\n✅ Calendar grid is valid (divisible by 7)")
        print(f"   Number of weeks: {len(calendar) // 7}")
    else:
        print(f"\n❌ Calendar grid is invalid (not divisible by 7)")
    
    # Show first week
    print(f"\n📋 First week of calendar:")
    for i in range(min(7, len(calendar))):
        day = calendar[i]
        print(f"   {day['weekday']} {day['day']:2d} - {day['date']}")
    
    # Show last week
    print(f"\n📋 Last week of calendar:")
    for i in range(max(0, len(calendar) - 7), len(calendar)):
        day = calendar[i]
        print(f"   {day['weekday']} {day['day']:2d} - {day['date']}")
    
    print(f"\n✨ Test completed successfully!")
