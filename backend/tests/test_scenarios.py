"""Regression conversations through the same brain and tools as live calls (offline rule agent)."""

from datetime import datetime, timedelta

import pytest


async def converse(client, auth, lines, from_number="+447700900999"):
    r = await client.post("/demo/sessions", json={"from_number": from_number}, headers=auth)
    call_id = r.json()["call_id"]
    replies = []
    for line in lines:
        r = await client.post(f"/demo/sessions/{call_id}/message", json={"text": line}, headers=auth)
        assert r.status_code in (200, 409), r.text
        if r.status_code == 409:
            break
        replies.append(r.json()["reply"])
        if r.json()["ended"]:
            break
    end = (await client.post(f"/demo/sessions/{call_id}/end", headers=auth)).json()
    detail = (await client.get(f"/calls/{call_id}", headers=auth)).json()
    return replies, end, detail


def _next_weekday_name():
    d = datetime.now() + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%A")


async def test_booking_flow(client, auth):
    day = _next_weekday_name()
    replies, end, detail = await converse(client, auth, [
        f"Hi, I'd like to book a boiler service on {day}",
        "Yes the first one please",
        "My name is Jamie Rivers",
    ], from_number="+447700900801")
    assert end["outcome"] == "BOOKED", replies
    assert any("booked" in r.lower() for r in replies)
    assert any(e["kind"] == "tool:book_appointment" and e["data"]["result"]["success"] for e in detail["events"])
    assert detail["contact"]["name"] == "Jamie Rivers"


async def test_double_booking_prevented(client, auth):
    day = _next_weekday_name()
    _, end1, d1 = await converse(client, auth, [f"book an appointment {day}", "first one", "my name is Ann Lee"], "+447700900802")
    _, end2, d2 = await converse(client, auth, [f"book an appointment {day}", "first one", "my name is Bob Kay"], "+447700900803")
    s1 = next(e for e in d1["events"] if e["kind"] == "tool:book_appointment")["data"]["args"]["start_iso"]
    s2 = next(e for e in d2["events"] if e["kind"] == "tool:book_appointment")["data"]["args"]["start_iso"]
    assert end1["outcome"] == end2["outcome"] == "BOOKED"
    assert s1 != s2


async def test_emergency(client, auth):
    replies, end, detail = await converse(client, auth, ["Help, a pipe burst and there's water everywhere!"], "+447700900804")
    assert "stopcock" in replies[0].lower()
    assert end["outcome"] == "EMERGENCY"
    tasks = (await client.get("/tasks", headers=auth)).json()
    assert any(t["call_id"] == detail["id"] and t["kind"] == "URGENT" for t in tasks)


async def test_out_of_area(client, auth):
    replies, end, _ = await converse(client, auth, ["I need a plumber, my postcode is LS1 4AP"], "+447700900805")
    assert "outside the area" in replies[0]


async def test_sales_call_screened(client, auth):
    replies, end, detail = await converse(client, auth, ["Hi, I'm calling about your business electricity contract, can I speak to the owner?"], "+447700900806")
    assert end["outcome"] == "SALES_CALL"
    assert "sales" in detail["contact"]["tags"]


async def test_human_request_creates_callback_or_transfer(client, auth):
    replies, end, detail = await converse(client, auth, ["Can I speak to a person please?"], "+447700900807")
    assert end["outcome"] in ("TRANSFERRED", "CALLBACK_REQUIRED")


async def test_price_question_uses_approved_price(client, auth):
    replies, end, _ = await converse(client, auth, ["How much is your call-out fee?"], "+447700900808")
    assert "95" in replies[0]
    assert end["outcome"] == "FAQ_RESOLVED"


async def test_running_late_notifies_staff(client, auth):
    replies, end, detail = await converse(client, auth, ["Hi it's Sarah, I'm running 10 minutes late"], "+447700900111")
    assert "running late" in replies[0].lower()
    tasks = (await client.get("/tasks", headers=auth)).json()
    assert any(t["call_id"] == detail["id"] and t["kind"] == "RUNNING_LATE" for t in tasks)


async def test_abandoned_call_texts_back(client, auth):
    r = await client.post("/demo/sessions", json={"from_number": "+447700900809"}, headers=auth)
    call_id = r.json()["call_id"]
    end = (await client.post(f"/demo/sessions/{call_id}/end", headers=auth)).json()
    assert end["outcome"] == "ABANDONED"
