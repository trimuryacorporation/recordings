const taskTransitions = {
    UNASSIGNED: ["ASSIGNED"],
    ASSIGNED: ["INVITED", "READY"],
    INVITED: ["READY"],
    READY: ["RECORDING"],
    RECORDING: ["UPLOADED"],
    UPLOADED: ["QA_PENDING"],
    QA_PENDING: ["APPROVED", "REJECTED"],
    APPROVED: ["COMPLETED"],
    REJECTED: ["RE_RECORD_REQUIRED"],
    RE_RECORD_REQUIRED: ["READY"],
    COMPLETED: []
};
const sessionTransitions = {
    CREATED: ["INVITED", "WAITING_FOR_PARTICIPANTS"],
    INVITED: ["WAITING_FOR_PARTICIPANTS"],
    WAITING_FOR_PARTICIPANTS: ["READY"],
    READY: ["RECORDING"],
    RECORDING: ["PROCESSING"],
    PROCESSING: ["UPLOADED"],
    UPLOADED: ["QA_PENDING"],
    QA_PENDING: ["COMPLETED"],
    COMPLETED: []
};
export function assertTaskTransition(from, to) {
    if (!taskTransitions[from]?.includes(to)) {
        throw new Error(`Invalid task transition: ${from} -> ${to}`);
    }
}
export function assertSessionTransition(from, to) {
    if (!sessionTransitions[from]?.includes(to)) {
        throw new Error(`Invalid session transition: ${from} -> ${to}`);
    }
}
